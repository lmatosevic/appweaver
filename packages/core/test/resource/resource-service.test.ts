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
        author: { model: 'User', type: 'oneToMany', owner: true },
        tags: { model: 'Tag', type: 'manyToMany' }
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

    test('returns the record when the relation counts are null', async () => {
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        _count: null
      });

      await expect(service.find(1)).resolves.toMatchObject({ id: 1 });
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

    test('maps a sort object in the declared field order', async () => {
      await service.query({}, 1, 50, { title: 'asc', views: 'desc' });

      expect(db.lastQuery('findMany').args.orderBy).toEqual([
        { title: 'asc' },
        { views: 'desc' }
      ]);
    });

    test('throws a bad request error for a direction that is not lower case', async () => {
      await expect(
        service.query({}, 1, 50, { title: 'ASC' } as any)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("Invalid sort direction 'ASC'")
      });
    });

    test('maps a nested relation sort object', async () => {
      await service.query({}, 1, 50, { author: { email: 'desc' }, id: 'asc' });

      expect(db.lastQuery('findMany').args.orderBy).toEqual([
        { author: { email: 'desc' } },
        { id: 'asc' }
      ]);
    });

    test('throws a bad request error for a field that cannot be sorted by', async () => {
      await expect(
        service.query({}, 1, 50, { unknown: 'asc' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('is not a sortable field')
      });
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

    test('maps a nested single relation filter through the related model', async () => {
      createModel({ name: 'User', scalars: { age: { type: 'int' } } }, true);
      linkModels();

      await new PostService().query({ author: { age: [18, 30] } });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        author: { age: { gte: 18, lte: 30 } }
      });
    });

    test('maps a nested list relation filter through the related model', async () => {
      await service.query({ tags: [{ name: ['news', 'tech'] }] });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        tags: [{ name: { in: ['news', 'tech'] } }]
      });
    });

    test('passes a null relation filter through unchanged', async () => {
      await service.query({ author: null });

      expect(db.lastQuery('findMany').args.where.AND[0]).toEqual({
        author: null
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
            author: { model: 'User', type: 'oneToMany', owner: true },
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              output: { type: 'single' }
            }
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
              type: 'manyToMany',
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

    test('connects a list relation given as plain ids', async () => {
      await service.create({ title: 'First', tags: [1, 2] });

      expect(db.lastQuery('create').args.data.tags).toEqual({
        connect: [{ id: 1 }, { id: 2 }]
      });
    });

    test('creates a related record inline when enabled', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            author: {
              model: 'User',
              type: 'oneToMany',
              owner: true,
              input: { type: 'all', allowCreate: true }
            }
          }
        },
        true
      );
      linkModels();

      await new PostService().create({
        title: 'First',
        author: { email: 'ada@mail.com' }
      });

      expect(db.lastQuery('create').args.data.author).toEqual({
        create: { email: 'ada@mail.com' }
      });
    });

    test('mixes connected and inline created records in a list relation', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              input: { type: 'all', allowCreate: true }
            }
          }
        },
        true
      );
      linkModels();

      await new PostService().create({
        title: 'First',
        tags: [{ id: 1 }, { name: 'fresh' }]
      });

      expect(db.lastQuery('create').args.data.tags).toEqual({
        connect: [{ id: 1 }],
        create: [{ name: 'fresh' }]
      });
    });

    test('connects instead of updating inline on the create action', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            author: {
              model: 'User',
              type: 'oneToMany',
              owner: true,
              input: { type: 'all', allowUpdate: true }
            }
          }
        },
        true
      );
      linkModels();

      await new PostService().create({
        title: 'First',
        author: { id: 5, email: 'ada@mail.com' }
      });

      expect(db.lastQuery('create').args.data.author).toEqual({
        connect: { id: 5 }
      });
    });

    test('matches records with the unique key when it is set', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              input: { type: 'all', allowCreate: true, uniqueKey: 'name' }
            }
          }
        },
        true
      );
      linkModels();

      await new PostService().create({ title: 'First', tags: ['fresh'] });

      expect(db.lastQuery('create').args.data.tags).toEqual({
        connectOrCreate: [
          {
            where: { name: 'fresh' },
            create: { name: 'fresh' }
          }
        ]
      });
    });

    test('rejects a new record when the unique key is set without allowCreate', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              input: { type: 'all', uniqueKey: 'name' }
            }
          }
        },
        true
      );
      linkModels();

      await expect(
        new PostService().create({ title: 'First', tags: [{ name: 'fresh' }] })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('does not accept new records')
      });
    });

    test('rejects an inline record missing a required field', async () => {
      createModel(
        {
          name: 'Tag',
          scalars: { name: { type: 'string' }, color: { type: 'string' } }
        },
        true
      );
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              input: { type: 'all', allowCreate: true }
            }
          }
        },
        true
      );
      linkModels();

      await expect(
        new PostService().create({ title: 'First', tags: [{ name: 'fresh' }] })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('missing required fields: color')
      });
    });

    test('drops the fields excluded from the related create model', async () => {
      createModel(
        {
          name: 'Tag',
          scalars: { name: { type: 'string' }, hits: { type: 'int' } },
          create: { omit: ['hits'] }
        },
        true
      );
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              input: { type: 'all', allowCreate: true }
            }
          }
        },
        true
      );
      linkModels();

      await new PostService().create({
        title: 'First',
        tags: [{ name: 'fresh', hits: 99 }]
      });

      expect(db.lastQuery('create').args.data.tags).toEqual({
        create: [{ name: 'fresh' }]
      });
    });

    test('rejects an inline record when creation is not enabled', async () => {
      await expect(
        service.create({ title: 'First', author: { email: 'ada@mail.com' } })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("relation 'author'")
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

    test('connects a relation that is currently empty', async () => {
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        author: null,
        tags: []
      });

      await service.update(1, { author: 9 });

      expect(db.lastQuery('update').args.data.author).toEqual({
        connect: { id: 9 }
      });
    });

    test('updates a related record inline when enabled', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            author: {
              model: 'User',
              type: 'oneToMany',
              owner: true,
              input: { type: 'all', allowUpdate: true }
            }
          }
        },
        true
      );
      linkModels();
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        author: { id: 2 }
      });

      await new PostService().update(1, {
        author: { id: 2, email: 'new@mail.com' }
      });

      expect(db.lastQuery('update').args.data.author).toEqual({
        update: { where: { id: 2 }, data: { email: 'new@mail.com' } }
      });
    });

    test('connects a record given by id only when inline update is enabled', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            author: {
              model: 'User',
              type: 'oneToMany',
              owner: true,
              input: { type: 'all', allowUpdate: true }
            }
          }
        },
        true
      );
      linkModels();
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        author: { id: 2 }
      });

      await new PostService().update(1, { author: { id: 9 } });

      expect(db.lastQuery('update').args.data.author).toEqual({
        connect: { id: 9 }
      });
    });

    test('drops the fields excluded from the related update model', async () => {
      createModel(
        {
          name: 'Tag',
          scalars: { name: { type: 'string' }, hits: { type: 'int' } },
          update: { pick: ['name'] }
        },
        true
      );
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              input: { type: 'all', allowUpdate: true }
            }
          }
        },
        true
      );
      linkModels();
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        tags: [{ id: 1 }]
      });

      await new PostService().update(1, {
        tags: [{ id: 1, name: 'renamed', hits: 99 }]
      });

      expect(db.lastQuery('update').args.data.tags).toEqual({
        update: [{ where: { id: 1 }, data: { name: 'renamed' } }]
      });
    });

    test('connects when every inline field is excluded from the update model', async () => {
      createModel(
        {
          name: 'Tag',
          scalars: { name: { type: 'string' }, hits: { type: 'int' } },
          update: { pick: ['name'] }
        },
        true
      );
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              input: { type: 'all', allowUpdate: true }
            }
          }
        },
        true
      );
      linkModels();
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        tags: [{ id: 1 }]
      });

      await new PostService().update(1, { tags: [{ id: 1, hits: 99 }] });

      expect(db.lastQuery('update').args.data.tags).toEqual({
        connect: [{ id: 1 }]
      });
    });

    test('updates list items inline while disconnecting missing ones', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            tags: {
              model: 'Tag',
              type: 'manyToMany',
              input: { type: 'all', allowUpdate: true }
            }
          }
        },
        true
      );
      linkModels();
      db.setResult('Post', 'findFirst', {
        id: 1,
        title: 'First',
        tags: [{ id: 1 }, { id: 2 }]
      });

      await new PostService().update(1, {
        tags: [{ id: 1, name: 'renamed' }]
      });

      expect(db.lastQuery('update').args.data.tags).toEqual({
        disconnect: [{ id: 2 }],
        update: [{ where: { id: 1 }, data: { name: 'renamed' } }]
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
      await service.aggregate({}, { views: { sum: true } });

      expect(db.lastQuery('aggregate').args._sum).toEqual({ views: true });
    });

    test('maps the aggregation results back to the response format', async () => {
      const result = await service.aggregate(
        {},
        { views: { sum: true } },
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
        { views: { sum: true } },
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
        { views: { sum: true } },
        'publishedAt',
        '2026-01-01T00:00:00.000Z',
        '2026-01-08T00:00:00.000Z'
      );

      const conditions = db.lastQuery('aggregate').args.where.AND;
      expect(conditions[1]).toHaveProperty('publishedAt');
    });

    test('applies the query filter to the aggregation', async () => {
      await service.aggregate(
        { title: 'First' },
        {
          views: { sum: true }
        }
      );

      const conditions = db.lastQuery('aggregate').args.where.AND[0].AND;
      expect(conditions[0]).toEqual({ title: 'First' });
    });

    describe('first and last operators', () => {
      // A one second range keeps the aggregation to a single period, so the
      // recorded queries belong to it and to the overall range alike
      const from = '2026-01-01T00:00:00.000Z';
      const to = '2026-01-01T00:00:01.000Z';

      const findFirstQueries = () =>
        db.queries.filter((query) => query.method === 'findFirst');

      test('reads the boundary records of the range', async () => {
        db.setResult('Post', 'aggregate', { _count: { _all: 2 } });
        db.setResult('Post', 'findFirst', (args: any) => ({
          views: args.orderBy[0].createdAt === 'asc' ? 3 : 9
        }));

        const result = await service.aggregate(
          {},
          { views: { first: true, last: true } },
          'createdAt',
          from,
          to
        );

        expect(result.total).toEqual({ views: { first: 3, last: 9 } });
        expect(result.items[0].result).toEqual({
          views: { first: 3, last: 9 }
        });
      });

      test('orders the boundary lookups by the aggregated date field', async () => {
        db.setResult('Post', 'aggregate', { _count: { _all: 2 } });
        db.setResult('Post', 'findFirst', { publishedAt: null });

        await service.aggregate(
          {},
          { views: { first: true } },
          'publishedAt',
          from,
          to
        );

        expect(findFirstQueries()).toHaveLength(1);
        expect(findFirstQueries()[0].args).toMatchObject({
          orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
          select: { views: true }
        });
      });

      test('applies the range query to the boundary lookups', async () => {
        db.setResult('Post', 'aggregate', { _count: { _all: 2 } });
        db.setResult('Post', 'findFirst', { views: 3 });

        await service.aggregate(
          { title: 'First' },
          { views: { first: true } },
          'createdAt',
          from,
          to
        );

        const conditions = findFirstQueries()[0].args.where.AND;
        expect(conditions[0].AND[0]).toEqual({ title: 'First' });
        expect(conditions[1]).toHaveProperty('createdAt');
      });

      test('skips the boundary lookups of an empty range', async () => {
        db.setResult('Post', 'aggregate', { _count: { _all: 0 } });

        const result = await service.aggregate(
          {},
          { views: { first: true, last: true } },
          'createdAt',
          from,
          to
        );

        expect(findFirstQueries()).toHaveLength(0);
        expect(result.total).toEqual({ views: { first: null, last: null } });
      });

      test('reads no boundary record when the operators are not selected', async () => {
        db.setResult('Post', 'aggregate', { _sum: { views: 8 } });

        await service.aggregate(
          {},
          { views: { sum: true } },
          'createdAt',
          from,
          to
        );

        expect(findFirstQueries()).toHaveLength(0);
        expect(db.lastQuery('aggregate').args).not.toHaveProperty('_count');
      });

      test('leaves the counted records of the range out of the response', async () => {
        db.setResult('Post', 'aggregate', {
          _count: { _all: 2, views: 2 },
          _sum: { views: 8 }
        });
        db.setResult('Post', 'findFirst', { views: 3 });

        const result = await service.aggregate(
          {},
          { views: { count: true, sum: true, first: true } },
          'createdAt',
          from,
          to
        );

        expect(result.total).toEqual({
          views: { count: 2, sum: 8, first: 3 }
        });
      });
    });

    test('throws a bad request error for an empty selection', async () => {
      await expect(service.aggregate({}, {} as any)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining(
          'at least one field with a selected aggregation operator'
        )
      });
    });

    test('throws a bad request error for a field that cannot be aggregated', async () => {
      await expect(
        service.aggregate({}, { title: { count: true } } as any)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('not a numeric or date field')
      });
    });

    test('throws a bad request error for an operator the field does not support', async () => {
      await expect(
        service.aggregate({}, { publishedAt: { sum: true } } as any)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("Cannot apply the 'sum' operator")
      });
    });

    test('throws a bad request error for a date field that is not a date', async () => {
      await expect(
        service.aggregate({}, { views: { sum: true } } as any, 'title')
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('not a date field')
      });
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
