import Fastify, { FastifyInstance } from 'fastify';
import { context } from '../../../context';
import { createModel } from '../../../factory/create-model';
import {
  buildQueryFilterSchema,
  QUERY_CONDITION_SCHEMA_NAME,
  QueryConditionSchema,
  queryFilterName
} from '../../../resource/schemas/resource-filter-schema';
import { resetContext } from '../../fixtures/context-fixture';

/**
 * Builds a server validating a request body against a model's query filter
 * schema with the same options the application server uses. The
 * `removeAdditional` option makes the validator strip every property that the
 * matched schema does not declare.
 */
async function server(schemaName: string): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: { removeAdditional: 'all', allowUnionTypes: true },
      plugins: [(ajv): any => ajv.addKeyword('example')]
    }
  });

  app.addSchema({
    ...QueryConditionSchema,
    $id: QUERY_CONDITION_SCHEMA_NAME
  });
  for (const model of context.resource.models.values()) {
    app.addSchema({
      ...buildQueryFilterSchema(model),
      $id: queryFilterName(model.name)
    });
  }

  app.post(
    '/',
    { schema: { body: { $ref: schemaName } } },
    // Echoes the validated body, so the test can assert on what survived
    async (request) => request.body as any
  );

  await app.ready();
  return app;
}

/** Sends the payload through request validation and returns what survived. */
async function validated(app: FastifyInstance, payload: any): Promise<any> {
  const response = await app.inject({
    method: 'POST',
    url: '/',
    payload
  });
  return { status: response.statusCode, body: response.json() };
}

describe('filter schema', () => {
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    resetContext();

    createModel({
      name: 'User',
      scalars: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        password: { type: 'string', hidden: true },
        loginAt: { type: 'dateTime', required: false }
      }
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
        enabled: { type: 'boolean' },
        keywords: { type: 'string', array: true },
        meta: { type: 'json' }
      },
      relations: {
        author: { model: 'User', type: 'oneToMany', owner: true },
        tags: { model: 'Tag', type: 'manyToMany' }
      }
    });

    app = await server(queryFilterName('Post'));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(() => {
    resetContext();
  });

  test('keeps declared fields with plain values without coercing them', async () => {
    const { status, body } = await validated(app!, {
      title: 'First',
      views: 10,
      enabled: true,
      keywords: ['news', 'tech']
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      title: 'First',
      views: 10,
      enabled: true,
      keywords: ['news', 'tech']
    });
  });

  test('keeps the id and audit fields', async () => {
    const { status, body } = await validated(app!, {
      id: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdById: 1
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      id: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdById: 1
    });
  });

  test('strips unknown fields', async () => {
    const { status, body } = await validated(app!, {
      title: 'First',
      unknownField: 'value'
    });

    expect(status).toBe(200);
    expect(body).toEqual({ title: 'First' });
  });

  test('strips hidden fields', async () => {
    const { body } = await validated(app!, {
      title: 'First',
      secretField: 'x'
    });

    expect(body).toEqual({ title: 'First' });
  });

  test('strips hidden fields of a nested relation filter', async () => {
    const { body } = await validated(app!, {
      author: { firstName: 'Ada', password: { _exists: true } }
    });

    expect(body).toEqual({ author: { firstName: 'Ada' } });
  });

  test('keeps operator conditions and strips unknown operators', async () => {
    const { status, body } = await validated(app!, {
      title: { _eq: 'First', _exists: true, _bogus: 'x' },
      views: { _gte: 10, _lt: 100 }
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      title: { _eq: 'First', _exists: true },
      views: { _gte: 10, _lt: 100 }
    });
  });

  test('keeps the operator value types untouched', async () => {
    const { body } = await validated(app!, {
      views: { _in: [1, 2, 3], _ne: 4 },
      enabled: { _eq: true }
    });

    expect(body).toEqual({
      views: { _in: [1, 2, 3], _ne: 4 },
      enabled: { _eq: true }
    });
  });

  test('keeps the logical operators given as objects', async () => {
    const { status, body } = await validated(app!, {
      _and: {
        title: { _eq: 'First' },
        views: { _gt: 10 }
      },
      _or: {
        title: { _like: 'Fir%' }
      }
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      _and: {
        title: { _eq: 'First' },
        views: { _gt: 10 }
      },
      _or: {
        title: { _like: 'Fir%' }
      }
    });
  });

  test('keeps the logical operators given as lists', async () => {
    const { status, body } = await validated(app!, {
      _or: [{ title: 'First' }, { views: { _gt: 10 } }]
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      _or: [{ title: 'First' }, { views: { _gt: 10 } }]
    });
  });

  test('strips unknown fields inside logical operators', async () => {
    const { body } = await validated(app!, {
      _and: { title: 'First', unknownField: 'x' }
    });

    expect(body).toEqual({ _and: { title: 'First' } });
  });

  test('keeps a nested relation filter', async () => {
    const { status, body } = await validated(app!, {
      author: {
        _or: {
          firstName: { _eq: 'Ada' },
          lastName: { _like: 'Love%' }
        },
        loginAt: { _exists: true }
      }
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      author: {
        _or: {
          firstName: { _eq: 'Ada' },
          lastName: { _like: 'Love%' }
        },
        loginAt: { _exists: true }
      }
    });
  });

  test('keeps a relation id shorthand without coercing it', async () => {
    const { body } = await validated(app!, {
      author: 5,
      tags: [1, 2]
    });

    expect(body).toEqual({ author: 5, tags: [1, 2] });
  });

  test('strips unknown fields inside a list of relation filters', async () => {
    const { status, body } = await validated(app!, {
      tags: [{ name: 'news', unknownField: 'x' }]
    });

    expect(status).toBe(200);
    expect(body).toEqual({ tags: [{ name: 'news' }] });
  });

  test('preserves the value types of every plain value position', async () => {
    const { body } = await validated(app!, {
      views: 10,
      enabled: false,
      title: null,
      keywords: ['a', 1, true]
    });

    expect(body).toEqual({
      views: 10,
      enabled: false,
      title: null,
      keywords: ['a', 1, true]
    });
  });

  test('preserves the value types inside operator conditions', async () => {
    const { body } = await validated(app!, {
      views: { _eq: 10, _in: [1, 2], _between: [5, 15] },
      enabled: { _eq: false },
      title: { _ne: null }
    });

    expect(body).toEqual({
      views: { _eq: 10, _in: [1, 2], _between: [5, 15] },
      enabled: { _eq: false },
      title: { _ne: null }
    });
  });

  test('keeps the list relation quantifiers', async () => {
    const { status, body } = await validated(app!, {
      tags: { _some: { name: { _contains: 'news' } } }
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      tags: { _some: { name: { _contains: 'news' } } }
    });
  });

  test('passes json field conditions through unvalidated', async () => {
    const { body } = await validated(app!, {
      meta: { size: { _gt: 50 }, anyStructure: { deep: true } }
    });

    expect(body).toEqual({
      meta: { size: { _gt: 50 }, anyStructure: { deep: true } }
    });
  });

  test('keeps the searchText property', async () => {
    const { body } = await validated(app!, { searchText: 'news' });

    expect(body).toEqual({ searchText: 'news' });
  });
});
