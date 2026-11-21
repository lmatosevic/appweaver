import { configOverrides, Database } from '@appweaver/common';
import { define, runAs, runInRequestScope } from '@appweaver/core';
import { runInTransaction, settleTransaction } from '@appweaver/core/internal';
import {
  createDatabaseStub,
  DatabaseStub,
  linkModels,
  resetContext
} from '@appweaver/testing';
import { AuditService } from '../../audit/audit-service';
import { createModel } from '../../factory/create-model';

describe('audit-service', () => {
  let db: DatabaseStub;
  let service: AuditService;

  const user = { id: 7, email: 'user@test.com', roles: [] };

  /** The rows written by the `createMany` of a model, of every flush so far. */
  const written = (model: 'AuditLog' | 'AuditChange'): any[] =>
    db.queries
      .filter((query) => query.model === model && query.method === 'createMany')
      .flatMap((query) => query.args.data);

  beforeEach(() => {
    resetContext();
    configOverrides.AUDIT_ENABLED = true;

    db = createDatabaseStub(['AuditLog', 'AuditChange', 'Post']);
    define(db.database, Database as any);

    createModel({
      name: 'Post',
      scalars: {
        title: { type: 'string' },
        secret: { type: 'string', hidden: true }
      }
    });
    linkModels();

    service = new AuditService();
  });

  afterEach(async () => {
    await service.onDestroy();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('enabled', () => {
    test('follows audit.enabled', () => {
      expect(service.enabled).toBe(true);

      configOverrides.AUDIT_ENABLED = false;

      expect(service.enabled).toBe(false);
    });
  });

  describe('isCategoryEnabled', () => {
    test('reads the switch of the category, read being off by default', () => {
      expect(service.isCategoryEnabled('write')).toBe(true);
      expect(service.isCategoryEnabled('read')).toBe(false);

      configOverrides.AUDIT_AUTH_ENABLED = false;

      expect(service.isCategoryEnabled('auth')).toBe(false);
    });

    test('is false for every category with the audit log disabled', () => {
      configOverrides.AUDIT_ENABLED = false;

      expect(service.isCategoryEnabled('write')).toBe(false);
    });
  });

  describe('isExcluded', () => {
    test('excludes the audit models and the configured models', () => {
      configOverrides.AUDIT_EXCLUDE_MODELS = ['session'];

      expect(service.isExcluded('AuditLog')).toBe(true);
      expect(service.isExcluded('Session', 'update')).toBe(true);
      expect(service.isExcluded('Post', 'update')).toBe(false);
    });

    test('excludes the actions of every model or of one', () => {
      configOverrides.AUDIT_EXCLUDE_ACTIONS = ['auth.refresh', 'Post.update'];

      expect(service.isExcluded(undefined, 'auth.refresh')).toBe(true);
      expect(service.isExcluded('Post', 'update')).toBe(true);
      expect(service.isExcluded('Tag', 'update')).toBe(false);
      expect(service.isExcluded()).toBe(false);
    });
  });

  describe('record', () => {
    test('writes the entry with the user and the scope of the call', async () => {
      const recorded = runInRequestScope(
        {
          source: 'job',
          ip: '10.0.0.7',
          userAgent: 'worker',
          requestId: 'req-1'
        },
        () =>
          runAs(user, () =>
            service.record({
              category: 'custom',
              action: 'invoice.sent',
              model: 'Invoice',
              resourceId: 5,
              metadata: { total: 10 }
            })
          )
      );
      await service.flush();

      expect(recorded).toBe(true);
      const [row] = written('AuditLog');
      expect(row).toMatchObject({
        category: 'custom',
        source: 'job',
        action: 'invoice.sent',
        model: 'Invoice',
        resourceId: '5',
        userId: '7',
        ip: '10.0.0.7',
        userAgent: 'worker',
        requestId: 'req-1',
        metadata: { total: 10 }
      });
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row).not.toHaveProperty('authType');
    });

    test('records the source system outside of a scope', async () => {
      service.record({ category: 'custom', action: 'cleanup' });
      await service.flush();

      expect(written('AuditLog')[0]).toMatchObject({ source: 'system' });
      expect(written('AuditLog')[0]).not.toHaveProperty('userId');
    });

    test('redacts and truncates the query, the body and the metadata', async () => {
      configOverrides.AUDIT_MAX_VALUE_SIZE = 50;

      service.record({
        category: 'write',
        query: { token: 'abc', page: '1' },
        body: { password: 'Secret1!', code: '123456' },
        metadata: { text: 'x'.repeat(100) },
        userAgent: 'a'.repeat(2000)
      });
      await service.flush();

      const [row] = written('AuditLog');
      expect(row.query).toEqual({ token: '[Redacted]', page: '1' });
      expect(row.body).toEqual({ password: '[Redacted]', code: '[Redacted]' });
      expect(row.metadata).toBe('[Truncated: 111 characters]');
      expect(row.userAgent).toHaveLength(1024);
    });

    test('anonymizes the client address when configured', async () => {
      configOverrides.AUDIT_ANONYMIZE_IP = true;

      service.record({ category: 'custom', ip: '192.168.1.42' });
      await service.flush();

      expect(written('AuditLog')[0].ip).toBe('192.168.1.0');
    });

    test('skips a disabled category, an excluded action and an excluded scope', async () => {
      configOverrides.AUDIT_EXCLUDE_ACTIONS = ['invoice.sent'];

      expect(service.record({ category: 'read' })).toBe(false);
      expect(
        service.record({ category: 'custom', action: 'invoice.sent' })
      ).toBe(false);
      expect(
        runInRequestScope({ source: 'http', excluded: true }, () =>
          service.record({ category: 'custom' })
        )
      ).toBe(false);
      await service.flush();

      expect(written('AuditLog')).toHaveLength(0);
    });
  });

  describe('recordChange', () => {
    test('records a change outside of a request with an entry of its own', async () => {
      runAs(user, () =>
        service.recordChange('Post', 'create', undefined, {
          id: 1,
          title: 'First',
          secret: 'hidden'
        })
      );
      await service.flush();

      const [log] = written('AuditLog');
      expect(log).toMatchObject({
        category: 'change',
        source: 'system',
        action: 'create',
        model: 'Post',
        resourceId: '1',
        userId: '7'
      });
      expect(written('AuditChange')).toEqual([
        expect.objectContaining({
          auditLogId: log.id,
          model: 'Post',
          resourceId: '1',
          action: 'create',
          diff: { title: { to: 'First' }, secret: { to: '[Redacted]' } }
        })
      ]);
    });

    test('records a change with the entry of its request', async () => {
      service.open('request-1');
      runInRequestScope({ source: 'http', auditId: 'request-1' }, () => {
        service.recordChange(
          'Post',
          'update',
          { id: 1, title: 'First' },
          { id: 1, title: 'Second' }
        );
      });
      service.close('request-1', {
        category: 'write',
        action: 'update',
        model: 'Post'
      });
      await service.flush();

      expect(written('AuditLog')).toEqual([
        expect.objectContaining({
          id: 'request-1',
          category: 'write',
          resourceId: '1'
        })
      ]);
      expect(written('AuditChange')).toEqual([
        expect.objectContaining({
          auditLogId: 'request-1',
          diff: { title: { from: 'First', to: 'Second' } }
        })
      ]);
    });

    test('keeps the resource of an entry changing several records unset', async () => {
      service.open('request-1');
      runInRequestScope({ source: 'http', auditId: 'request-1' }, () => {
        service.recordChange('Post', 'create', undefined, {
          id: 1,
          title: 'A'
        });
        service.recordChange('Post', 'create', undefined, {
          id: 2,
          title: 'B'
        });
      });
      service.close('request-1', {
        category: 'write',
        action: 'bulkCreate',
        model: 'Post'
      });
      await service.flush();

      expect(written('AuditLog')[0]).not.toHaveProperty('resourceId');
      expect(written('AuditChange')).toHaveLength(2);
    });

    test('records the changes of a request without an entry with entries of their own', async () => {
      service.open('request-1');
      runInRequestScope(
        {
          source: 'http',
          auditId: 'request-1',
          action: 'update',
          ip: '1.2.3.4'
        },
        () =>
          service.recordChange(
            'Post',
            'delete',
            { id: 1, title: 'A' },
            undefined
          )
      );
      service.close('request-1');
      await service.flush();

      const [log] = written('AuditLog');
      expect(log).toMatchObject({
        category: 'change',
        source: 'http',
        action: 'update',
        ip: '1.2.3.4'
      });
      expect(log.id).not.toBe('request-1');
      expect(written('AuditChange')[0]).toMatchObject({
        auditLogId: log.id,
        diff: { title: { from: 'A' } }
      });
    });

    test('waits for the commit of the transaction', async () => {
      const transaction = {
        commitCallbacks: new Map(),
        rollbackCallbacks: []
      } as any;

      runInTransaction(transaction, () =>
        service.recordChange('Post', 'create', undefined, { id: 1, title: 'A' })
      );
      await service.flush();
      expect(written('AuditChange')).toHaveLength(0);

      await settleTransaction(transaction, true);
      await service.flush();
      expect(written('AuditChange')).toHaveLength(1);
    });

    test('skips an update changing nothing, an unknown model and a record without an id', async () => {
      service.recordChange(
        'Post',
        'update',
        { id: 1, title: 'A' },
        { id: 1, title: 'A' }
      );
      service.recordChange('Missing', 'create', undefined, { id: 1 });
      service.recordChange('Post', 'create', undefined, { title: 'A' });
      await service.flush();

      expect(written('AuditLog')).toHaveLength(0);
    });

    test('skips the changes with audit.changes disabled, excluded or in an excluded scope', async () => {
      configOverrides.AUDIT_EXCLUDE_MODELS = ['Post'];
      service.recordChange('Post', 'create', undefined, { id: 1, title: 'A' });
      delete configOverrides.AUDIT_EXCLUDE_MODELS;

      runInRequestScope({ source: 'http', excluded: true }, () =>
        service.recordChange('Post', 'create', undefined, { id: 2, title: 'B' })
      );

      configOverrides.AUDIT_CHANGES_ENABLED = false;
      service.recordChange('Post', 'create', undefined, { id: 3, title: 'C' });
      await service.flush();

      expect(written('AuditLog')).toHaveLength(0);
    });
  });

  describe('open / close', () => {
    test('records nothing with the audit log disabled', async () => {
      configOverrides.AUDIT_ENABLED = false;
      service.open('request-1');

      expect(service.close('request-1', { category: 'write' })).toBe(false);
      await service.flush();
      expect(written('AuditLog')).toHaveLength(0);
    });
  });

  describe('flush', () => {
    test('writes the entries in batches of audit.batchSize', async () => {
      configOverrides.AUDIT_BATCH_SIZE = 2;

      for (let i = 0; i < 3; i++) {
        service.record({ category: 'custom', action: `action.${i}` });
      }
      await service.flush();

      const batches = db.queries.filter(
        (query) => query.model === 'AuditLog' && query.method === 'createMany'
      );
      expect(batches.map((batch) => batch.args.data.length)).toEqual([2, 1]);
    });

    test('shares a flush in progress', async () => {
      service.record({ category: 'custom' });

      await Promise.all([service.flush(), service.flush()]);

      expect(written('AuditLog')).toHaveLength(1);
    });

    test('buffers a failed batch again once, then drops it', async () => {
      db.setResult('AuditLog', 'createMany', new Error('database down'));
      service.record({ category: 'custom' });

      await service.flush();
      await service.flush();
      db.setResult('AuditLog', 'createMany', undefined);
      await service.flush();

      const attempts = db.queries.filter(
        (query) => query.model === 'AuditLog' && query.method === 'createMany'
      );
      expect(attempts).toHaveLength(2);
    });

    test('drops the new entries while the buffer is full', async () => {
      configOverrides.AUDIT_MAX_BUFFER = 1;
      configOverrides.AUDIT_BATCH_SIZE = 10;

      expect(service.record({ category: 'custom' })).toBe(true);
      expect(service.record({ category: 'custom' })).toBe(false);
      await service.flush();

      expect(written('AuditLog')).toHaveLength(1);
    });
  });

  describe('purge', () => {
    test('deletes the entries older than the retention of their category, with their changes', async () => {
      configOverrides.AUDIT_RETENTION = '30d';
      configOverrides.AUDIT_AUTH_RETENTION = '365d';
      configOverrides.AUDIT_CUSTOM_RETENTION = '';
      const now = new Date('2026-11-21T00:00:00.000Z');
      db.setResult('AuditLog', 'findMany', (args: any) =>
        args.where.category.in.includes('auth')
          ? []
          : [{ id: 'a' }, { id: 'b' }]
      );

      const count = await service.purge(now);

      expect(count).toBe(2);
      const finds = db.queries.filter((query) => query.method === 'findMany');
      expect(finds.map((query) => query.args.where)).toEqual([
        {
          category: { in: ['auth'] },
          createdAt: { lt: new Date('2025-11-21T00:00:00.000Z') }
        },
        {
          category: { in: ['read', 'write', 'change', 'custom'] },
          createdAt: { lt: new Date('2026-10-22T00:00:00.000Z') }
        }
      ]);
      expect(db.lastQuery('deleteMany').args).toEqual({
        where: { id: { in: ['a', 'b'] } }
      });
      expect(
        db.queries.find((query) => query.model === 'AuditChange')?.args
      ).toEqual({ where: { auditLogId: { in: ['a', 'b'] } } });
    });

    test('keeps every entry without a retention', async () => {
      configOverrides.AUDIT_RETENTION = '';

      await expect(service.purge()).resolves.toBe(0);
      expect(db.queries).toHaveLength(0);
    });

    test('deletes the expired entries in batches', async () => {
      configOverrides.AUDIT_RETENTION = '1d';
      let calls = 0;
      db.setResult('AuditLog', 'findMany', () =>
        calls++ === 0
          ? Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }))
          : []
      );

      await expect(service.purge()).resolves.toBe(1000);
      expect(calls).toBe(2);
    });
  });

  describe('onReady', () => {
    test('starts nothing with the audit log disabled', () => {
      configOverrides.AUDIT_ENABLED = false;

      service.onReady();

      expect(db.queries).toHaveLength(0);
    });

    test('deletes the expired entries at once', async () => {
      configOverrides.AUDIT_RETENTION = '1d';
      db.setResult('AuditLog', 'findMany', []);

      service.onReady();
      await new Promise((resolve) => setImmediate(resolve));

      expect(db.lastQuery('findMany')).toBeDefined();
    });

    test('leaves the deletes to another instance without the retention worker', () => {
      configOverrides.AUDIT_RETENTION_WORKER = false;

      service.onReady();

      expect(db.queries).toHaveLength(0);
    });

    test('logs a failed delete', async () => {
      db.setResult('AuditLog', 'findMany', new Error('database down'));

      service.onReady();
      await new Promise((resolve) => setImmediate(resolve));

      expect(db.lastQuery('findMany')).toBeDefined();
    });

    test('rejects an interval that is not a duration', () => {
      configOverrides.AUDIT_FLUSH_INTERVAL = 'soon';

      expect(() => service.onReady()).toThrow(
        "Audit log flush interval 'soon' is not a duration, i.e. 1h"
      );
    });
  });

  describe('onShutdown', () => {
    test('writes the buffered entries', async () => {
      service.record({ category: 'custom' });

      await service.onShutdown();

      expect(written('AuditLog')).toHaveLength(1);
    });
  });
});
