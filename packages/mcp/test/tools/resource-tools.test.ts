import { configOverrides } from '@appweaver/common';
import { createModel } from '@appweaver/data';
import { linkModels, resetContext } from '@appweaver/testing';
import { context } from '@appweaver/core/internal';
import { resourceTools } from '../../tools/resource-tools';
import { toJsonSchema } from '../../utils/schema-util';
import { admin, post, user, usePosts } from '../fixtures/mcp-app';

const tool = (name: string) => resourceTools().find((t) => t.name === name)!;
const ctx = { user: user as never };

describe('resource-tools', () => {
  beforeEach(() => {
    resetContext();
  });

  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('resourceTools', () => {
    test('builds the tools of the exposed actions only', () => {
      usePosts({ actions: ['find', 'query', 'aggregate', 'create'] });
      context.resource.routes.set('Hidden', {
        config: { modelName: 'Hidden' },
        basePath: 'hidden',
        handler: () => {}
      });

      expect(
        resourceTools().map((t) => [t.name, t.readOnly, t.destructive])
      ).toEqual([
        ['post_find', true, false],
        ['post_query', true, false],
        ['post_aggregate', true, false],
        ['post_create', false, false]
      ]);
    });

    test('takes the access of the config or of an action, and their descriptions', () => {
      usePosts({
        roles: ['editor'],
        description: 'The articles of the blog.',
        actions: [
          'find',
          { action: 'update', roles: ['admin'], description: 'Edits a post.' },
          { action: 'delete' }
        ]
      });

      const [find, update, remove] = resourceTools();

      expect(find.access).toEqual({ roles: ['editor'] });
      expect(find.description).toBe(
        'Finds a Post by its id. The articles of the blog.'
      );
      expect(update.access).toEqual({ roles: ['admin'] });
      expect(update.description).toBe(
        'Edits a post. The articles of the blog.'
      );
      expect(remove.access).toEqual({ roles: ['editor'] });
    });

    test('takes the access of the API route of an action when the mcp config sets none', () => {
      usePosts(
        {
          actions: [
            'find',
            'query',
            'create',
            'update',
            { action: 'delete', permissions: ['post:purge'] }
          ]
        },
        {
          defaults: { roles: ['editor'] },
          find: { public: true, exclude: true },
          create: { auth: ['apiKey'] },
          update: { roles: ['admin'], permissions: ['post:edit'] },
          delete: { roles: ['admin'] }
        }
      );

      expect(resourceTools().map((t) => [t.name, t.access])).toEqual([
        ['post_find', { public: true }],
        ['post_query', { roles: ['editor'] }],
        ['post_create', {}],
        ['post_update', { roles: ['admin'], permissions: ['post:edit'] }],
        ['post_delete', { permissions: ['post:purge'] }]
      ]);
    });

    test('overrides the access of the API routes with the one of the mcp config', () => {
      usePosts(
        {
          public: true,
          actions: ['find', { action: 'query', roles: ['agent'] }]
        },
        { defaults: { roles: ['editor'] }, find: { roles: ['admin'] } }
      );

      expect(resourceTools().map((t) => t.access)).toEqual([
        { public: true },
        { roles: ['agent'] }
      ]);
    });

    test('finds a record, projected without the hidden and the excluded fields', async () => {
      const service = usePosts({ actions: ['find'], exclude: ['views'] });

      const record = await tool('post_find').call({ id: 1 }, ctx);

      expect(service.find).toHaveBeenCalledWith(1);
      expect(record).toEqual({
        id: 1,
        title: 'Hello',
        createdAt: post.createdAt,
        updatedAt: post.updatedAt
      });
    });

    test('leaves the hidden fields of the related records out', async () => {
      createModel({
        name: 'User',
        scalars: {
          email: { type: 'string' },
          passwordHash: { type: 'string', hidden: true }
        }
      });
      createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } },
        relations: {
          author: { model: 'User', type: 'one', required: false },
          editors: { model: 'User', type: 'many' }
        }
      } as never);
      linkModels();
      context.resource.routes.set('Post', {
        config: { modelName: 'Post', mcp: { actions: ['find', 'query'] } },
        basePath: 'posts',
        handler: () => {}
      } as never);
      const author = { id: 2, email: 'a@test.com', passwordHash: 'hash' };
      const record = {
        id: 1,
        title: 'Hello',
        author,
        editors: [{ ...author, id: 3 }]
      };
      context.resource.services.set('Post', {
        find: async () => record,
        query: async () => ({ items: [record] })
      } as never);

      const found: any = await tool('post_find').call({ id: 1 }, ctx);
      const queried: any = await tool('post_query').call({}, ctx);

      for (const result of [found, queried.items[0]]) {
        expect(result.author).toEqual({ id: 2, email: 'a@test.com' });
        expect(result.editors).toEqual([{ id: 3, email: 'a@test.com' }]);
      }
    });

    test('leaves the excluded fields out of the filter, the sort and the aggregations', () => {
      usePosts({ actions: ['query', 'aggregate'], exclude: ['views'] });

      const query = toJsonSchema(tool('post_query').input) as any;
      const aggregate = toJsonSchema(tool('post_aggregate').input) as any;

      expect(query.properties.filter.properties).toHaveProperty('title');
      expect(query.properties.filter.properties).not.toHaveProperty('views');
      expect(query.properties.sort.properties).not.toHaveProperty('views');
      expect(aggregate.properties.select.properties).not.toHaveProperty(
        'views'
      );
    });

    test('queries the records, at most the limit per page', async () => {
      const service = usePosts({ actions: ['query'], maxLimit: 5 });
      const query = tool('post_query');

      const response: any = await query.call(
        { filter: { title: { _contains: 'He' } }, sort: { createdAt: 'desc' } },
        ctx
      );
      await query.call({ size: 2, page: 2 }, ctx);

      expect(service.query.mock.calls).toEqual([
        [
          {
            filter: { title: { _contains: 'He' } },
            sort: { createdAt: 'desc' },
            size: 5
          }
        ],
        [{ size: 2, page: 2 }]
      ]);
      expect(response.items[0]).not.toHaveProperty('secret');
      expect(toJsonSchema(query.input)).toMatchObject({
        properties: { size: { maximum: 5 } }
      });
    });

    test('limits the queries by the config by default', () => {
      configOverrides.MCP_MAX_LIMIT = 20;
      usePosts({ actions: ['query'] });

      expect(toJsonSchema(tool('post_query').input)).toMatchObject({
        properties: { size: { maximum: 20 } }
      });
    });

    test('filters and sorts the visible scalar fields', () => {
      usePosts({ actions: ['query', 'aggregate'] });

      const query = toJsonSchema(tool('post_query').input) as any;
      const aggregate = toJsonSchema(tool('post_aggregate').input) as any;
      const filter = query.properties.filter.properties;

      expect(Object.keys(filter)).toEqual([
        'id',
        'createdAt',
        'updatedAt',
        'createdById',
        'title',
        'views',
        'status',
        '_or'
      ]);
      expect(Object.keys(filter.title.anyOf[1].properties)).toContain(
        '_contains'
      );
      expect(Object.keys(filter.views.anyOf[1].properties)).not.toContain(
        '_contains'
      );
      expect(filter.status.anyOf[0].enum).toEqual(['draft', 'published']);
      expect(Object.keys(query.properties.sort.properties)).toContain('views');
      expect(Object.keys(aggregate.properties.select.properties)).toEqual([
        'id',
        'createdAt',
        'updatedAt',
        'views'
      ]);
    });

    test('aggregates the records', async () => {
      const service = usePosts({ actions: ['aggregate'] });

      await tool('post_aggregate').call(
        { select: { views: { sum: true } } },
        ctx
      );

      expect(service.aggregate).toHaveBeenCalledWith({
        select: { views: { sum: true } }
      });
    });

    test('creates, updates and deletes a record', async () => {
      const service = usePosts({ actions: ['create', 'update', 'delete'] });

      const created: any = await tool('post_create').call(
        { title: 'New', views: 0 },
        ctx
      );
      await tool('post_update').call({ id: 1, data: { title: 'Edited' } }, ctx);
      await tool('post_delete').call({ id: 1 }, ctx);

      expect(created.title).toBe('New');
      expect(service.create).toHaveBeenCalledWith({ title: 'New', views: 0 });
      expect(service.update).toHaveBeenCalledWith(1, { title: 'Edited' });
      expect(service.delete).toHaveBeenCalledWith(1);
      expect(toJsonSchema(tool('post_create').input)).toMatchObject({
        type: 'object',
        properties: { title: { type: 'string' } }
      });
      expect(admin).toBeDefined();
    });
  });
});
