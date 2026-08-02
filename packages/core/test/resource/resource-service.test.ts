import { Database, Events } from '@appweaver/common';
import { define } from '../../context';
import { CacheService } from '../../cache';
import { NodeEvents } from '../../events/node-events';
import { HttpError } from '../../errors';
import { createModel } from '../../factory/create-model';
import { ResourceService } from '../../resource/resource-service';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';
import { createDatabaseStub, DatabaseStub } from '../fixtures/database-fixture';

class PostService extends ResourceService<any, any, any, any, any> {
  constructor() {
    super('Post');
  }
}

describe('resource-service', () => {
  let db: DatabaseStub;
  let invalidateCache: jest.Mock;
  let events: NodeEvents;
  let service: PostService;

  const defineModels = () => {
    createModel({
      name: 'User',
      scalars: { email: { type: 'string' } }
    });
    createModel({
      name: 'Tag',
      scalars: { name: { type: 'string' } }
    });
    createModel({
      name: 'Post',
      scalars: {
        title: { type: 'string' },
        views: { type: 'int' },
        publishedAt: { type: 'dateTime' },
        keywords: { type: 'string', array: true },
        secret: { type: 'string', hidden: true }
      },
      virtual: {
        excerpt: {
          type: 'string',
          output: { value: (post: any) => `${post.title ?? ''}...` }
        }
      },
      relations: {
        author: { model: 'User', owner: true },
        tags: { model: 'Tag', array: true }
      }
    });
    linkModels();
  };

  beforeEach(() => {
    resetContext();

    db = createDatabaseStub(['Post', 'User', 'Tag']);
    define(db.database, Database as any);

    events = new NodeEvents();
    define(events, Events as any);

    invalidateCache = jest.fn().mockResolvedValue(undefined);
    define({ invalidateCache }, CacheService);

    defineModels();

    service = new PostService();
  });

  afterAll(() => {
    resetContext();
  });

  describe('constructor', () => {
    test('exposes the model client', () => {
      expect(service.client.name).toBe('Post');
      expect(service.modelName).toBe('Post');
    });

    test('throws for a model without a database client', () => {
      class MissingService extends ResourceService {
        constructor() {
          super('Missing');
        }
      }

      expect(() => new MissingService()).toThrow(
        'ResourceService initialized with invalid model name: Missing'
      );
    });
  });

  describe('find', () => {
    test('queries the record by id and returns it', async () => {
      db.setResult('Post', 'findFirst', { id: 1, title: 'First' });

      const post = await service.find(1);

      expect(db.lastQuery('findFirst').args.where).toEqual({ id: 1 });
      expect(post).toMatchObject({ id: 1, title: 'First' });
    });

    test('includes the configured relations', async () => {
      db.setResult('Post', 'findFirst', { id: 1, title: 'First' });

      await service.find(1);

      expect(db.lastQuery('findFirst').args.include).toEqual({
        author: true,
        tags: true
      });
    });

    test('projects the virtual fields onto the result', async () => {
      db.setResult('Post', 'findFirst', { id: 1, title: 'First' });

      await expect(service.find(1)).resolves.toHaveProperty(
        'excerpt',
        'First...'
      );
    });

    test('maps the relation counts to count fields', async () => {
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        _count: { tags: 3 }
      });

      const post: any = await service.find(1);

      expect(post.tagsCount).toBe(3);
      expect(post._count).toBeUndefined();
    });

    test('throws a not found error for a missing record', async () => {
      db.setResult('Post', 'findFirst', null);

      await expect(service.find(1)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('data not found')
      });
    });

    test('throws a not found error when the returned id differs', async () => {
      db.setResult('Post', 'findFirst', { id: 2 });

      await expect(service.find(1)).rejects.toMatchObject({ statusCode: 404 });
    });

    test('wraps a database error into a server error', async () => {
      db.setResult('Post', 'findFirst', new Error('connection lost'));

      await expect(service.find(1)).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('find error')
      });
    });

    test('applies the read restrictions to the query', async () => {
      class RestrictedService extends PostService {
        protected async readRestrictions(): Promise<any> {
          return { authorId: 7 };
        }
      }
      db.setResult('Post', 'findFirst', { id: 1 });

      await new RestrictedService().find(1);

      expect(db.lastQuery('findFirst').args.where).toEqual({
        id: 1,
        authorId: 7
      });
    });

    test('throws a forbidden error when the access check fails', async () => {
      class ForbiddenService extends PostService {
        protected async checkAccess(): Promise<boolean> {
          return false;
        }
      }
      db.setResult('Post', 'findFirst', { id: 1 });

      await expect(new ForbiddenService().find(1)).rejects.toMatchObject({
        statusCode: 403
      });
    });

    test('emits a find resource event', async () => {
      const handler = jest.fn();
      events.onResourceEvent('Post', 'find', handler);
      db.setResult('Post', 'findFirst', { id: 1, title: 'First' });

      await service.find(1);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ current: { id: 1, title: 'First' } })
      );
    });
  });

  describe('query', () => {
    beforeEach(() => {
      db.setResult('Post', 'findMany', [{ id: 1, title: 'First' }]);
      db.setResult('Post', 'count', 1);
    });

    test('returns the items with the result and total counts', async () => {
      const result = await service.query();

      expect(result.totalCount).toBe(1);
      expect(result.resultCount).toBe(1);
      expect(result.items[0]).toMatchObject({ id: 1, title: 'First' });
    });

    test('applies the pagination values', async () => {
      await service.query({}, 3, 20);

      expect(db.lastQuery('findMany').args).toMatchObject({
        skip: 40,
        take: 20
      });
    });

    test('sorts by the default sort value', async () => {
      await service.query();

      expect(db.lastQuery('findMany').args.orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'asc' }
      ]);
    });

    test('maps ascending and descending sort fields', async () => {
      await service.query({}, 1, 50, 'title,-views');

      expect(db.lastQuery('findMany').args.orderBy).toEqual([
        { title: 'asc' },
        { views: 'desc' }
      ]);
    });

    test('maps a nested relation sort field', async () => {
      await service.query({}, 1, 50, '-author.email');

      expect(db.lastQuery('findMany').args.orderBy).toEqual([
        { author: { email: 'desc' } }
      ]);
    });

    test('maps a relation count sort field', async () => {
      await service.query({}, 1, 50, '-tagsCount');

      expect(db.lastQuery('findMany').args.orderBy).toEqual([
        { tags: { _count: 'desc' } }
      ]);
    });

    test('maps a scalar filter value directly', async () => {
      await service.query({ title: 'First' });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        title: 'First'
      });
    });

    test('maps a list of scalar values to an inclusion filter', async () => {
      await service.query({ title: ['First', 'Second'] });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        title: { in: ['First', 'Second'] }
      });
    });

    test('maps a numeric range filter', async () => {
      await service.query({ views: [10, 100] });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        views: { gte: 10, lte: 100 }
      });
    });

    test('maps a date range filter', async () => {
      await service.query({
        publishedAt: ['2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z']
      });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        publishedAt: {
          gte: '2026-01-01T00:00:00Z',
          lte: '2026-02-01T00:00:00Z'
        }
      });
    });

    test('maps an array scalar filter to a contains filter', async () => {
      await service.query({ keywords: 'news' });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        keywords: { has: 'news' }
      });
    });

    test('maps a list of array scalar values to a hasSome filter', async () => {
      await service.query({ keywords: ['news', 'tech'] });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        keywords: { hasSome: ['news', 'tech'] }
      });
    });

    test('maps a single relation filter to an id filter', async () => {
      await service.query({ author: 5 });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        author: { id: 5 }
      });
    });

    test('maps a list relation filter to a some filter', async () => {
      await service.query({ tags: [1, 2] });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        tags: { some: { id: { in: [1, 2] } } }
      });
    });

    test('applies the read restrictions to the query', async () => {
      class RestrictedService extends PostService {
        protected async readRestrictions(): Promise<any> {
          return { authorId: 7 };
        }
      }
      const restricted = new RestrictedService();

      await restricted.query({ title: 'First' });

      expect(db.lastQuery('findMany').args.where.AND).toContainEqual({
        authorId: 7
      });
    });

    test('applies the text search query and removes the search filter', async () => {
      class SearchService extends PostService {
        protected textSearchQuery(searchText: string): any {
          return { title: { contains: searchText } };
        }
      }

      await new SearchService().query({ searchText: 'news' } as any);

      const conditions = db.lastQuery('findMany').args.where.AND;
      expect(conditions).toContainEqual({ title: { contains: 'news' } });
      expect(conditions[0]).toEqual({});
    });

    test('includes only the relations allowed for the query action', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            author: { model: 'User', owner: true },
            tags: { model: 'Tag', array: true, output: { type: 'single' } }
          }
        },
        true
      );
      linkModels();
      const querying = new PostService();
      db.setResult('Post', 'findMany', []);
      db.setResult('Post', 'count', 0);

      await querying.query();

      expect(db.lastQuery('findMany').args.include).toEqual({ author: true });
    });

    test('adds the relation count selection when configured', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              array: true,
              output: { type: 'always', count: true }
            }
          }
        },
        true
      );
      linkModels();
      const counting = new PostService();
      db.setResult('Post', 'findMany', []);
      db.setResult('Post', 'count', 0);

      await counting.query();

      expect(db.lastQuery('findMany').args.include._count).toEqual({
        select: { tags: true }
      });
    });

    test('wraps a database error into a server error', async () => {
      db.setResult('Post', 'findMany', new Error('connection lost'));

      await expect(service.query()).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('query error')
      });
    });

    test('emits a query resource event', async () => {
      const handler = jest.fn();
      events.onResourceEvent('Post', 'query', handler);

      await service.query();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    beforeEach(() => {
      db.setResult('Post', 'create', (args: any) => ({ id: 1, ...args.data }));
    });

    test('creates the record and returns it', async () => {
      const post = await service.create({ title: 'First' });

      expect(db.lastQuery('create').args.data).toMatchObject({
        title: 'First'
      });
      expect(post).toMatchObject({ id: 1, title: 'First' });
    });

    test('removes undefined values from the data', async () => {
      await service.create({ title: 'First', views: undefined });

      expect(Object.keys(db.lastQuery('create').args.data)).not.toContain(
        'views'
      );
    });

    test('removes virtual fields from the stored data', async () => {
      await service.create({ title: 'First', excerpt: 'ignored' });

      expect(db.lastQuery('create').args.data).not.toHaveProperty('excerpt');
    });

    test('adds a default value for a required hidden scalar', async () => {
      await service.create({ title: 'First' });

      expect(db.lastQuery('create').args.data.secret).toBe('');
    });

    test('connects a single relation given by id', async () => {
      await service.create({ title: 'First', author: 5 });

      expect(db.lastQuery('create').args.data.author).toEqual({
        connect: { id: 5 }
      });
    });

    test('connects a single relation given as an object', async () => {
      await service.create({ title: 'First', author: { id: 5 } });

      expect(db.lastQuery('create').args.data.author).toEqual({
        connect: { id: 5 }
      });
    });

    test('connects a list relation', async () => {
      await service.create({ title: 'First', tags: [{ id: 1 }, { id: 2 }] });

      expect(db.lastQuery('create').args.data.tags).toEqual({
        connect: [{ id: 1 }, { id: 2 }]
      });
    });

    test('applies the write restrictions', async () => {
      class RestrictedService extends PostService {
        protected async writeRestrictions(): Promise<any> {
          return { views: 0 };
        }
      }

      await new RestrictedService().create({ title: 'First' });

      expect(db.lastQuery('create').args.data.views).toBe(0);
    });

    test('throws a forbidden error when the access check fails', async () => {
      class ForbiddenService extends PostService {
        protected async checkAccess(): Promise<boolean> {
          return false;
        }
      }

      await expect(
        new ForbiddenService().create({ title: 'First' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('wraps a database error into a server error', async () => {
      db.setResult('Post', 'create', new Error('constraint violation'));

      await expect(service.create({ title: 'First' })).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('create error')
      });
    });

    test('invalidates the resource cache', async () => {
      await service.create({ title: 'First' });

      expect(invalidateCache).toHaveBeenCalledWith('Post', 'create');
    });

    test('emits a create resource event', async () => {
      const handler = jest.fn();
      events.onResourceEvent('Post', 'create', handler);

      await service.create({ title: 'First' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ current: expect.objectContaining({ id: 1 }) })
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      db.setResult('Post', 'findFirst', { id: 1, title: 'First', tags: [] });
      db.setResult('Post', 'update', (args: any) => ({
        id: 1,
        ...args.data
      }));
    });

    test('updates the record and returns the new state', async () => {
      const post = await service.update(1, { title: 'Updated' });

      expect(db.lastQuery('update').args.where).toEqual({ id: 1 });
      expect(db.lastQuery('update').args.data).toMatchObject({
        title: 'Updated'
      });
      expect(post).toMatchObject({ title: 'Updated' });
    });

    test('reads the current record before updating', async () => {
      await service.update(1, { title: 'Updated' });

      expect(db.queries[0]).toMatchObject({
        method: 'findFirst',
        args: { where: { id: 1 } }
      });
    });

    test('throws a not found error for a missing record', async () => {
      db.setResult('Post', 'findFirst', null);

      await expect(service.update(1, { title: 'x' })).rejects.toMatchObject({
        statusCode: 404
      });
    });

    test('throws a forbidden error when the access check fails', async () => {
      class ForbiddenService extends PostService {
        protected async checkAccess(): Promise<boolean> {
          return false;
        }
      }

      await expect(
        new ForbiddenService().update(1, { title: 'x' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('connects a reassigned relation', async () => {
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        author: { id: 2 },
        tags: []
      });

      await service.update(1, { author: 9 });

      expect(db.lastQuery('update').args.data.author).toEqual({
        connect: { id: 9 }
      });
    });

    test('skips the relation action when the record has no current relation', async () => {
      await service.update(1, { author: 9 });

      expect(db.lastQuery('update').args.data.author).toBeUndefined();
    });

    test('disconnects a relation that is set to null', async () => {
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        author: { id: 2 },
        tags: []
      });

      await service.update(1, { author: null });

      expect(db.lastQuery('update').args.data.author).toEqual({
        disconnect: { id: 2 }
      });
    });

    test('disconnects the relations that are no longer assigned', async () => {
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        tags: [{ id: 1 }, { id: 2 }]
      });

      await service.update(1, { tags: [{ id: 1 }] });

      expect(db.lastQuery('update').args.data.tags).toEqual({
        disconnect: [{ id: 2 }],
        connect: [{ id: 1 }]
      });
    });

    test('wraps a database error into a server error', async () => {
      db.setResult('Post', 'update', new Error('constraint violation'));

      await expect(service.update(1, { title: 'x' })).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('update error')
      });
    });

    test('invalidates the resource cache', async () => {
      await service.update(1, { title: 'Updated' });

      expect(invalidateCache).toHaveBeenCalledWith('Post', 'update');
    });

    test('emits an update event with the previous and current state', async () => {
      const handler = jest.fn();
      events.onResourceEvent('Post', 'update', handler);

      await service.update(1, { title: 'Updated' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          previous: expect.objectContaining({ title: 'First' }),
          current: expect.objectContaining({ title: 'Updated' })
        })
      );
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      db.setResult('Post', 'findFirst', { id: 1, title: 'First' });
      db.setResult('Post', 'delete', { id: 1, title: 'First' });
    });

    test('deletes the record and returns it', async () => {
      const post = await service.delete(1);

      expect(db.lastQuery('delete').args.where).toEqual({ id: 1 });
      expect(post).toMatchObject({ id: 1, title: 'First' });
    });

    test('throws a not found error for a missing record', async () => {
      db.setResult('Post', 'findFirst', null);

      await expect(service.delete(1)).rejects.toMatchObject({
        statusCode: 404
      });
    });

    test('throws a forbidden error when the access check fails', async () => {
      class ForbiddenService extends PostService {
        protected async checkAccess(): Promise<boolean> {
          return false;
        }
      }

      await expect(new ForbiddenService().delete(1)).rejects.toMatchObject({
        statusCode: 403
      });
    });

    test('applies the read restrictions when loading the record', async () => {
      class RestrictedService extends PostService {
        protected async readRestrictions(): Promise<any> {
          return { authorId: 7 };
        }
      }

      await new RestrictedService().delete(1);

      expect(db.queries[0].args.where).toEqual({ id: 1, authorId: 7 });
    });

    test('wraps a database error into a server error', async () => {
      db.setResult('Post', 'delete', new Error('foreign key constraint'));

      await expect(service.delete(1)).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('delete error')
      });
    });

    test('invalidates the resource cache', async () => {
      await service.delete(1);

      expect(invalidateCache).toHaveBeenCalledWith('Post', 'delete');
    });

    test('emits a delete resource event', async () => {
      const handler = jest.fn();
      events.onResourceEvent('Post', 'delete', handler);

      await service.delete(1);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('aggregate', () => {
    beforeEach(() => {
      db.setResult('Post', 'aggregate', {
        _count: { id: 4 },
        _sum: { views: 8 }
      });
    });

    test('maps the selection to the Prisma aggregation operators', async () => {
      await service.aggregate({}, { views: { sum: true } } as any);

      expect(db.lastQuery('aggregate').args._sum).toEqual({ views: true });
    });

    test('maps the aggregation results back to the response format', async () => {
      const result = await service.aggregate(
        {},
        { views: { sum: true } } as any,
        'createdAt',
        '2026-01-01T00:00:00.000Z',
        '2026-01-08T00:00:00.000Z'
      );

      expect(result.total).toEqual({ id: { count: 4 }, views: { sum: 8 } });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].result).toEqual({
        id: { count: 4 },
        views: { sum: 8 }
      });
    });

    test('splits the interval into periods', async () => {
      const result = await service.aggregate(
        {},
        { views: { sum: true } } as any,
        'createdAt',
        '2026-01-01T00:00:00.000Z',
        '2026-01-08T00:00:00.000Z'
      );

      expect(result.items).toHaveLength(7);
      expect(result.items[0].date).toBeInstanceOf(Date);
    });

    test('applies the date field range to every aggregation', async () => {
      await service.aggregate(
        {},
        { views: { sum: true } } as any,
        'publishedAt',
        '2026-01-01T00:00:00.000Z',
        '2026-01-08T00:00:00.000Z'
      );

      const conditions = db.lastQuery('aggregate').args.where.AND;
      expect(conditions[1]).toHaveProperty('publishedAt');
    });

    test('applies the query filter to the aggregation', async () => {
      await service.aggregate({ title: 'First' }, {
        views: { sum: true }
      } as any);

      const conditions = db.lastQuery('aggregate').args.where.AND[0].AND;
      expect(conditions[0]).toEqual({ title: 'First' });
    });

    test('wraps a database error into a server error', async () => {
      db.setResult('Post', 'aggregate', new Error('aggregation failed'));

      await expect(
        service.aggregate({}, { views: { sum: true } } as any)
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('aggregation')
      });
    });

    test('throws an HttpError subclass for failures', async () => {
      db.setResult('Post', 'aggregate', new Error('aggregation failed'));

      await expect(
        service.aggregate({}, { views: { sum: true } } as any)
      ).rejects.toBeInstanceOf(HttpError);
    });
  });
});
