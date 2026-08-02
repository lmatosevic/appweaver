import {
  CONFIG,
  Database,
  Events,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE
} from '@appweaver/common';
import { context, define } from '../../context';
import { CacheService } from '../../cache';
import { NodeEvents } from '../../events/node-events';
import { createModel } from '../../factory/create-model';
import { createService } from '../../factory/create-service';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';
import { createDatabaseStub, DatabaseStub } from '../fixtures/database-fixture';

const policy = (config: Record<string, any>) =>
  ({
    modelName: 'Post',
    ...config,
    [RESOURCE_TYPE]: RESOURCE_POLICY_TYPE
  }) as any;

describe('create-service', () => {
  let db: DatabaseStub;

  beforeEach(() => {
    resetContext();

    db = createDatabaseStub(['Post']);
    define(db.database, Database as any);
    define(new NodeEvents(), Events as any);
    define(
      { invalidateCache: jest.fn().mockResolvedValue(undefined) } as any,
      CacheService
    );

    createModel({ name: 'Post', scalars: { title: { type: 'string' } } });
    linkModels();
    define(policy({}), 'Post');

    db.setResult('Post', 'findFirst', { id: 1, title: 'First' });
    db.setResult('Post', 'findMany', [{ id: 1, title: 'First' }]);
    db.setResult('Post', 'count', 1);
    db.setResult('Post', 'create', { id: 1, title: 'First' });
    db.setResult('Post', 'update', { id: 1, title: 'Updated' });
    db.setResult('Post', 'delete', { id: 1, title: 'First' });
  });

  afterAll(() => {
    resetContext();
  });

  describe('createService', () => {
    test('creates a service class registered in the context', () => {
      const Service = createService({ modelName: 'Post' });

      expect(Service.name).toBe('PostService');
      expect(Service[RESOURCE_TYPE]).toBe(RESOURCE_SERVICE_TYPE);
      expect(Service[RESOURCE_NAME]).toBe('Post');
      expect(context.resource.services.get('Post')).toBe(Service);
    });

    test('keeps the service configuration on the class and the instance', () => {
      const config = { modelName: 'Post' };
      const Service = createService(config);

      expect(Service[CONFIG]).toBe(config);
      expect(new Service()[CONFIG]).toBe(config);
    });

    test('capitalizes the model name', () => {
      const Service = createService({ modelName: 'post' });

      expect(Service[RESOURCE_NAME]).toBe('Post');
    });

    test('keeps the first service when the same model is registered twice', () => {
      const first = createService({ modelName: 'Post' });
      createService({ modelName: 'Post' });

      expect(context.resource.services.get('Post')).toBe(first);
    });

    test('replaces the service when the override flag is set', () => {
      createService({ modelName: 'Post' });
      const second = createService({ modelName: 'Post' }, true);

      expect(context.resource.services.get('Post')).toBe(second);
    });
  });

  describe('lifecycle hooks', () => {
    test('calls the find hooks around the action', async () => {
      const calls: string[] = [];
      const Service = createService({
        modelName: 'Post',
        beforeFind: (id: number) => {
          calls.push(`before:${id}`);
        },
        afterFind: (result: any) => {
          calls.push(`after:${result.id}`);
        }
      });

      await new Service().find(1);

      expect(calls).toEqual(['before:1', 'after:1']);
    });

    test('calls the query hooks with the query arguments', async () => {
      const beforeQuery = jest.fn();
      const afterQuery = jest.fn();
      const Service = createService({
        modelName: 'Post',
        beforeQuery,
        afterQuery
      });

      await new Service().query({ title: 'First' }, 2, 10, 'title');

      expect(beforeQuery).toHaveBeenCalledWith(
        { title: 'First' },
        2,
        10,
        'title'
      );
      expect(afterQuery).toHaveBeenCalledWith(
        expect.objectContaining({ totalCount: 1 })
      );
    });

    test('calls the create hooks', async () => {
      const beforeCreate = jest.fn();
      const afterCreate = jest.fn();
      const Service = createService({
        modelName: 'Post',
        beforeCreate,
        afterCreate
      });

      await new Service().create({ title: 'First' } as any);

      expect(beforeCreate).toHaveBeenCalledWith({ title: 'First' });
      expect(afterCreate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 })
      );
    });

    test('calls the update hooks', async () => {
      const beforeUpdate = jest.fn();
      const afterUpdate = jest.fn();
      const Service = createService({
        modelName: 'Post',
        beforeUpdate,
        afterUpdate
      });

      await new Service().update(1, { title: 'Updated' } as any);

      expect(beforeUpdate).toHaveBeenCalledWith(1, { title: 'Updated' });
      expect(afterUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Updated' })
      );
    });

    test('calls the delete hooks', async () => {
      const beforeDelete = jest.fn();
      const afterDelete = jest.fn();
      const Service = createService({
        modelName: 'Post',
        beforeDelete,
        afterDelete
      });

      await new Service().delete(1);

      expect(beforeDelete).toHaveBeenCalledWith(1);
      expect(afterDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 })
      );
    });

    test('propagates an error thrown by a before hook', async () => {
      const Service = createService({
        modelName: 'Post',
        beforeFind: () => {
          throw new Error('hook failure');
        }
      });

      await expect(new Service().find(1)).rejects.toThrow('hook failure');
      expect(db.queries).toHaveLength(0);
    });

    test('works without any configured hooks', async () => {
      const Service = createService({ modelName: 'Post' });

      await expect(new Service().find(1)).resolves.toMatchObject({ id: 1 });
    });
  });

  describe('text search', () => {
    test('uses a configured text search object', async () => {
      const Service = createService({
        modelName: 'Post',
        textSearch: { title: { contains: '{input}' } }
      });

      await new Service().query({ searchText: 'news' } as any);

      expect(db.lastQuery('findMany').args.where.AND).toContainEqual({
        title: { contains: '{input}' }
      });
    });

    test('uses a configured text search function', async () => {
      const Service = createService({
        modelName: 'Post',
        textSearch: (input: string) => ({ title: { contains: input } })
      });

      await new Service().query({ searchText: 'news' } as any);

      expect(db.lastQuery('findMany').args.where.AND).toContainEqual({
        title: { contains: 'news' }
      });
    });

    test('adds no text search filter by default', async () => {
      const Service = createService({ modelName: 'Post' });

      await new Service().query({ searchText: 'news' } as any);

      expect(db.lastQuery('findMany').args.where.AND).toEqual([{}, {}, {}]);
    });
  });

  describe('policy integration', () => {
    test('applies the read restrictions of the policy', async () => {
      define(
        policy({ readRestrictions: () => ({ authorId: 7 }) }),
        'Post',
        'override'
      );
      const Service = createService({ modelName: 'Post' });

      await new Service().find(1);

      expect(db.lastQuery('findFirst').args.where).toEqual({
        id: 1,
        authorId: 7
      });
    });

    test('passes the action and data to the read restrictions', async () => {
      const readRestrictions = jest.fn().mockReturnValue({});
      define(policy({ readRestrictions }), 'Post', 'override');
      const Service = createService({ modelName: 'Post' });

      await new Service().find(1);

      expect(readRestrictions).toHaveBeenCalledWith(null, 1, 'find');
    });

    test('applies the write restrictions of the policy', async () => {
      define(
        policy({ writeRestrictions: () => ({ authorId: 7 }) }),
        'Post',
        'override'
      );
      const Service = createService({ modelName: 'Post' });

      await new Service().create({ title: 'First' } as any);

      expect(db.lastQuery('create').args.data.authorId).toBe(7);
    });

    test('denies the action when the policy check fails', async () => {
      define(policy({ checkAccess: () => false }), 'Post', 'override');
      const Service = createService({ modelName: 'Post' });

      await expect(new Service().find(1)).rejects.toMatchObject({
        statusCode: 403
      });
    });

    test('allows the action when the policy check passes', async () => {
      define(policy({ checkAccess: () => true }), 'Post', 'override');
      const Service = createService({ modelName: 'Post' });

      await expect(new Service().find(1)).resolves.toMatchObject({ id: 1 });
    });

    test('falls back to no restrictions when the policy has none', async () => {
      const Service = createService({ modelName: 'Post' });

      await new Service().find(1);

      expect(db.lastQuery('findFirst').args.where).toEqual({ id: 1 });
    });
  });
});
