import {
  CONFIG,
  Database,
  Events,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE,
  ResourceId
} from '@appweaver/common';
import { context, define } from '../../context';
import { CacheService } from '../../cache';
import { NodeEvents } from '../../events/node-events';
import { createModel } from '../../factory/create-model';
import { createService } from '../../factory/create-service';
import { withoutPolicies } from '../../utils';
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
        beforeFind: (id: ResourceId) => {
          calls.push(`before:${id}`);
        },
        afterFind: (result: any) => {
          calls.push(`after:${result.id}`);
        }
      });

      await new Service().find(1);

      expect(calls).toEqual(['before:1', 'after:1']);
    });

    test('calls the query hooks with the query options', async () => {
      const beforeQuery = jest.fn();
      const afterQuery = jest.fn();
      const Service = createService({
        modelName: 'Post',
        beforeQuery,
        afterQuery
      });

      await new Service().query({
        filter: { title: 'First' },
        page: 2,
        size: 10,
        sort: 'title'
      });

      expect(beforeQuery).toHaveBeenCalledWith({
        filter: { title: 'First' },
        page: 2,
        size: 10,
        sort: 'title'
      });
      expect(afterQuery).toHaveBeenCalledWith(
        expect.objectContaining({ totalCount: 1 })
      );
    });

    test('forwards the cursor and the count flag to the query', async () => {
      const beforeQuery = jest.fn();
      const Service = createService({ modelName: 'Post', beforeQuery });
      const service = new Service();
      db.setResult('Post', 'findMany', [{ id: 1 }, { id: 2 }, { id: 3 }]);

      const first = await service.query({ page: 1, size: 2 });
      const result = await service.query({
        page: 1,
        size: 2,
        sort: '-createdAt',
        cursor: first.nextCursor,
        totalCount: false
      });

      expect(beforeQuery).toHaveBeenLastCalledWith({
        page: 1,
        size: 2,
        sort: '-createdAt',
        cursor: first.nextCursor,
        totalCount: false
      });
      expect(result.totalCount).toBeNull();
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
        expect.objectContaining({ title: 'Updated' }),
        expect.objectContaining({ title: 'First' })
      );
    });

    test('lets the query hook change the query options', async () => {
      const Service = createService({
        modelName: 'Post',
        beforeQuery: (options) => {
          options.size = 5;
        }
      });

      await new Service().query({ size: 10 });

      // One record past the page is fetched to detect a further page
      expect(db.lastQuery('findMany').args.take).toBe(6);
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

      await new Service().query({ filter: { searchText: 'news' } });

      expect(db.lastQuery('findMany').args.where.AND).toContainEqual({
        title: { contains: 'news' }
      });
    });

    test('turns an OR object of a text search object into a list', async () => {
      const Service = createService({
        modelName: 'Post',
        textSearch: {
          OR: {
            title: { contains: '{input}' },
            excerpt: { contains: '{input}' }
          }
        }
      });

      await new Service().query({ filter: { searchText: 'news' } });

      expect(db.lastQuery('findMany').args.where.AND).toContainEqual({
        OR: [{ title: { contains: 'news' } }, { excerpt: { contains: 'news' } }]
      });
    });

    test('binds a cursor to the text search rather than to the filter', async () => {
      // The search term is stripped off the filter before the query is built,
      // so a cursor bound to the filter alone would carry over between searches
      const Service = createService({
        modelName: 'Post',
        textSearch: (input: string) => ({ title: { contains: input } })
      });
      const service = new Service();
      db.setResult('Post', 'findMany', [{ id: 1 }, { id: 2 }, { id: 3 }]);

      const first = await service.query({
        filter: { searchText: 'news' },
        page: 1,
        size: 2
      });

      await expect(
        service.query({
          filter: { searchText: 'other' },
          page: 1,
          size: 2,
          cursor: first.nextCursor
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('uses a configured text search function', async () => {
      const Service = createService({
        modelName: 'Post',
        textSearch: (input: string) => ({ title: { contains: input } })
      });

      await new Service().query({ filter: { searchText: 'news' } });

      expect(db.lastQuery('findMany').args.where.AND).toContainEqual({
        title: { contains: 'news' }
      });
    });

    test('adds no text search filter by default', async () => {
      const Service = createService({ modelName: 'Post' });

      await new Service().query({ filter: { searchText: 'news' } });

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

    test('awaits an async policy check', async () => {
      define(policy({ checkAccess: async () => false }), 'Post', 'override');
      const Service = createService({ modelName: 'Post' });

      await expect(new Service().find(1)).rejects.toMatchObject({
        statusCode: 403
      });
    });

    test('awaits async restrictions', async () => {
      define(
        policy({
          readRestrictions: async () => ({ authorId: 7 }),
          writeRestrictions: async () => null
        }),
        'Post',
        'override'
      );
      const Service = createService({ modelName: 'Post' });
      const service = new Service();

      await service.find(1);
      expect(db.lastQuery('findFirst').args.where).toEqual({
        id: 1,
        authorId: 7
      });

      // A restriction resolving to nothing restricts nothing
      await service.create({ title: 'First' } as any);
      expect(db.lastQuery('create').args.data.title).toBe('First');
    });

    test('skips the policy with internal access', async () => {
      const readRestrictions = jest.fn().mockReturnValue({ authorId: 7 });
      const writeRestrictions = jest.fn().mockReturnValue({ authorId: 7 });
      const checkAccess = jest.fn().mockReturnValue(false);
      define(
        policy({ readRestrictions, writeRestrictions, checkAccess }),
        'Post',
        'override'
      );
      const Service = createService({ modelName: 'Post' });
      const service = new Service();

      await expect(
        withoutPolicies(() => service.find(1))
      ).resolves.toMatchObject({ id: 1 });
      await withoutPolicies(() => service.create({ title: 'First' } as any));

      expect(db.lastQuery('findFirst').args.where).toEqual({ id: 1 });
      expect(db.lastQuery('create').args.data.authorId).toBeUndefined();
      expect(readRestrictions).not.toHaveBeenCalled();
      expect(writeRestrictions).not.toHaveBeenCalled();
      expect(checkAccess).not.toHaveBeenCalled();
    });

    test('applies the policy again after the internal access ends', async () => {
      define(policy({ checkAccess: () => false }), 'Post', 'override');
      const Service = createService({ modelName: 'Post' });
      const service = new Service();

      await withoutPolicies(() => service.find(1));

      await expect(service.find(1)).rejects.toMatchObject({
        statusCode: 403
      });
    });

    test('works for a resource that has no policy at all', async () => {
      // Most framework resources ship without one, so a missing policy must not fail the request
      context.resource.policies.delete('Post');
      const Service = createService({ modelName: 'Post' });
      const service = new Service();

      await expect(service.find(1)).resolves.toMatchObject({ id: 1 });
      await expect(service.query()).resolves.toMatchObject({
        items: [{ id: 1 }]
      });
      await expect(
        service.create({ title: 'First' } as any)
      ).resolves.toMatchObject({ id: 1 });
      await expect(
        service.update(1, { title: 'Updated' } as any)
      ).resolves.toMatchObject({ id: 1 });
    });

    test('falls back to no restrictions when the policy has none', async () => {
      const Service = createService({ modelName: 'Post' });

      await new Service().find(1);

      expect(db.lastQuery('findFirst').args.where).toEqual({ id: 1 });
    });
  });
});
