import Fastify, { FastifyInstance } from 'fastify';
import { RelationInput, resourceModelProps } from '@appweaver/common';
import { context } from '../../context';
import { createModel } from '../../factory/create-model';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';
import { errorHandler } from '../../errors';
import { requestValidation } from '../../server/request-validation';

/**
 * Builds a server validating a request body against a model schema with the
 * same options the application server uses, which reject every property the
 * schema it matches does not declare, and respond with the problem details of
 * the most relevant error. A relation item is validated against the exact
 * shapes the relation accepts: an id, an inline update, or an inline create.
 */
async function server(schemaName: string): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ...requestValidation()
  });
  app.setErrorHandler(errorHandler);

  const added = new Set<string>();
  for (const model of context.resource.models.values()) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      const name = `${model.name}${suffix}`;
      const schema = model[property]['$defs']?.[name];
      if (schema && !added.has(name)) {
        added.add(name);
        app.addSchema({ ...schema, $id: name });
      }
    }
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

/** Sends an invalid payload, returning the field errors of the response. */
async function rejected(app: FastifyInstance, payload: any): Promise<any[]> {
  const { status, body } = await validated(app, payload);
  expect(status).toBe(400);
  return body.errors.map(({ field, rule, message }: any) => ({
    field,
    rule,
    message
  }));
}

describe('relation input schema', () => {
  let app: FastifyInstance | undefined;

  const defineModels = (input: RelationInput) => {
    createModel({
      name: 'Post',
      scalars: {
        title: { type: 'string' },
        slug: { type: 'string' },
        views: { type: 'int' },
        status: { type: 'string', required: false }
      },
      // Restricts the fields accepted by each action, so that payloads carrying
      // the fields of the other action are covered as well
      create: { omit: ['views'] },
      update: { pick: ['title', 'views'] }
    });
    createModel({
      name: 'User',
      scalars: { email: { type: 'string' } },
      relations: {
        posts: { model: 'Post', type: 'oneToMany', mappedBy: 'author', input }
      }
    });
    linkModels();
  };

  beforeEach(() => {
    resetContext();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(() => {
    resetContext();
  });

  describe('inline writes enabled', () => {
    beforeEach(() => {
      defineModels({ type: 'all', allowCreate: true, allowUpdate: true });
    });

    test('keeps the fields of an inline update payload', async () => {
      app = await server('UserUpdate');

      const { status, body } = await validated(app, {
        email: 'ada@mail.com',
        posts: [{ id: 1, title: 'Renamed' }]
      });

      expect(status).toBe(200);
      expect(body.posts).toEqual([{ id: 1, title: 'Renamed' }]);
    });

    test('keeps the fields of an inline create payload', async () => {
      app = await server('UserCreate');

      const { status, body } = await validated(app, {
        email: 'ada@mail.com',
        posts: [{ title: 'Fresh', slug: 'fresh', status: 'Draft' }]
      });

      expect(status).toBe(200);
      expect(body.posts).toEqual([
        { title: 'Fresh', slug: 'fresh', status: 'Draft' }
      ]);
    });

    test('keeps a mixed connect, create, and update payload', async () => {
      app = await server('UserUpdate');

      const { status, body } = await validated(app, {
        posts: [5, { id: 1, title: 'Renamed' }, { title: 'Fresh', slug: 'new' }]
      });

      expect(status).toBe(200);
      expect(body.posts).toEqual([
        5,
        { id: 1, title: 'Renamed' },
        { title: 'Fresh', slug: 'new' }
      ]);
    });

    test('rejects the fields that the related model does not declare', async () => {
      app = await server('UserUpdate');

      expect(
        await rejected(app, { posts: [{ id: 1, unknownField: 'x' }] })
      ).toEqual([
        {
          field: 'posts.0.unknownField',
          rule: 'additionalProperties',
          message: 'is not allowed'
        }
      ]);
    });

    test('rejects a create field of an inline update', async () => {
      app = await server('UserUpdate');

      expect(await rejected(app, { posts: [{ id: 1, slug: 'x' }] })).toEqual([
        {
          field: 'posts.0.slug',
          rule: 'additionalProperties',
          message: 'is not allowed'
        }
      ]);
    });

    test('rejects an update field of an inline create', async () => {
      app = await server('UserUpdate');

      expect(
        await rejected(app, {
          posts: [{ title: 'Fresh', slug: 'fresh', views: 1 }]
        })
      ).toEqual([
        {
          field: 'posts.0.views',
          rule: 'additionalProperties',
          message: 'is not allowed'
        }
      ]);
    });

    test('names the missing field of an inline create', async () => {
      app = await server('UserUpdate');

      expect(await rejected(app, { posts: [{ title: 'Fresh' }] })).toEqual([
        { field: 'posts.0.slug', rule: 'required', message: 'is required' }
      ]);
    });

    test('names the invalid value of an inline update field', async () => {
      app = await server('UserUpdate');

      expect(
        await rejected(app, { posts: [{ id: 1, title: { text: 'x' } }] })
      ).toEqual([
        { field: 'posts.0.title', rule: 'type', message: 'must be string' }
      ]);
    });

    test('lists the accepted types of an invalid item', async () => {
      app = await server('UserUpdate');

      expect(await rejected(app, { posts: ['abc'] })).toEqual([
        {
          field: 'posts.0',
          rule: 'type',
          message: 'must be object or integer'
        }
      ]);
    });

    test('rejects an inline update of a parent create', async () => {
      app = await server('UserCreate');

      expect(
        await rejected(app, { email: 'a@b.c', posts: [{ id: 1, title: 'x' }] })
      ).toEqual([
        {
          field: 'posts.0.title',
          rule: 'additionalProperties',
          message: 'is not allowed'
        }
      ]);
    });
  });

  describe('inline writes disabled', () => {
    beforeEach(() => {
      defineModels({ type: 'all' });
    });

    test('accepts an id object and a bare id', async () => {
      app = await server('UserUpdate');

      const { status, body } = await validated(app, {
        posts: [{ id: 1 }, 2]
      });

      expect(status).toBe(200);
      expect(body.posts).toEqual([{ id: 1 }, 2]);
    });

    test('rejects the data of a relation that only connects records', async () => {
      app = await server('UserUpdate');

      expect(
        await rejected(app, { posts: [{ id: 1, title: 'Renamed' }] })
      ).toEqual([
        {
          field: 'posts.0.title',
          rule: 'additionalProperties',
          message: 'is not allowed'
        }
      ]);
    });

    test('requires the id of a relation that only connects records', async () => {
      app = await server('UserUpdate');

      expect(await rejected(app, { posts: [{ title: 'Fresh' }] })).toEqual([
        { field: 'posts.0.id', rule: 'required', message: 'is required' },
        {
          field: 'posts.0.title',
          rule: 'additionalProperties',
          message: 'is not allowed'
        }
      ]);
    });

    test('reports every invalid item of the list', async () => {
      app = await server('UserUpdate');

      expect(
        await rejected(app, { posts: [{ id: 1, title: 'x' }, 2, 'abc'] })
      ).toEqual([
        {
          field: 'posts.0.title',
          rule: 'additionalProperties',
          message: 'is not allowed'
        },
        { field: 'posts.2', rule: 'type', message: 'must be object or integer' }
      ]);
    });
  });
});
