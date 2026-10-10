import { Type } from '@sinclair/typebox';
import Fastify, { FastifyInstance } from 'fastify';
import { context } from '../../../context';
import { createModel } from '../../../factory/create-model';
import {
  buildQuerySortSchema,
  querySortName,
  querySortSchema
} from '../../../resource/schemas/resource-sort-schema';
import { resetContext } from '../../fixtures/context-fixture';
import { requestValidation } from '../../../server/request-validation';

/**
 * Builds a server validating a request body against a model's query sort
 * schema with the same options the application server uses, which reject
 * every property the matched schema does not declare.
 */
async function server(modelName: string): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ...requestValidation()
  });

  for (const model of context.resource.models.values()) {
    app.addSchema({
      ...buildQuerySortSchema(model),
      $id: querySortName(model.name)
    });
  }

  app.post(
    '/',
    { schema: { body: Type.Object({ sort: querySortSchema(modelName) }) } },
    // Echoes the validated body, so the test can assert on what survived
    async (request) => request.body as any
  );

  await app.ready();
  return app;
}

/** Sends the payload through request validation and returns what survived. */
async function validated(app: FastifyInstance, sort: any): Promise<any> {
  const response = await app.inject({
    method: 'POST',
    url: '/',
    payload: { sort }
  });
  return { status: response.statusCode, body: response.json() };
}

describe('sort schema', () => {
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    resetContext();

    createModel({
      name: 'User',
      scalars: {
        firstName: { type: 'string' },
        password: { type: 'string', hidden: true }
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
        keywords: { type: 'string', array: true }
      },
      virtual: {
        excerpt: { type: 'string', output: { value: () => '' } }
      },
      relations: {
        author: { model: 'User', type: 'oneToMany', owner: true },
        tags: { model: 'Tag', type: 'manyToMany' }
      }
    });

    app = await server('Post');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(() => {
    resetContext();
  });

  test('keeps a comma-separated field list string', async () => {
    const { status, body } = await validated(app!, '-author.createdAt,title');

    expect(status).toBe(200);
    expect(body.sort).toBe('-author.createdAt,title');
  });

  test('keeps the scalar, id and audit fields of a sort object', async () => {
    const { status, body } = await validated(app!, {
      id: 'asc',
      title: 'asc',
      views: 'desc',
      createdAt: 'desc',
      updatedAt: 'asc',
      createdById: 'asc'
    });

    expect(status).toBe(200);
    expect(body.sort).toEqual({
      id: 'asc',
      title: 'asc',
      views: 'desc',
      createdAt: 'desc',
      updatedAt: 'asc',
      createdById: 'asc'
    });
  });

  test('rejects a sort direction that is not lower case', async () => {
    expect((await validated(app!, { title: 'ASC' })).status).toBe(400);
    expect((await validated(app!, { title: 'Desc' })).status).toBe(400);
  });

  test('keeps a nested relation sort object', async () => {
    const { status, body } = await validated(app!, {
      author: { firstName: 'desc' },
      title: 'asc'
    });

    expect(status).toBe(200);
    expect(body.sort).toEqual({ author: { firstName: 'desc' }, title: 'asc' });
  });

  test('keeps a list relation and its count field', async () => {
    const { status, body } = await validated(app!, {
      tags: 'desc',
      tagsCount: 'asc'
    });

    expect(status).toBe(200);
    expect(body.sort).toEqual({ tags: 'desc', tagsCount: 'asc' });
  });

  test('rejects unknown fields', async () => {
    const { status } = await validated(app!, {
      title: 'asc',
      unknownField: 'asc'
    });

    expect(status).toBe(400);
  });

  test.each([
    ['virtual', { excerpt: 'asc' }],
    ['array scalar', { keywords: 'asc' }],
    ['hidden', { author: { password: 'asc', firstName: 'asc' } }]
  ])('rejects a %s field', async (_, sort) => {
    const { status } = await validated(app!, sort);

    expect(status).toBe(400);
  });

  test('rejects an unknown sort direction', async () => {
    const { status } = await validated(app!, { title: 'ascending' });

    expect(status).toBe(400);
  });

  test('rejects a direction on a to-one relation', async () => {
    const { status } = await validated(app!, { author: 'asc' });

    expect(status).toBe(400);
  });

  test('rejects an unknown sort direction of a relation field', async () => {
    const { status } = await validated(app!, { author: { firstName: 'up' } });

    expect(status).toBe(400);
  });

  test('rejects a sort value that is neither a field list nor a sort object', async () => {
    const { status } = await validated(app!, [1, 2]);

    expect(status).toBe(400);
  });
});
