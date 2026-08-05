import Fastify, { FastifyInstance } from 'fastify';
import { RelationInput, resourceModelProps } from '@appweaver/common';
import { context } from '../../context';
import { createModel } from '../../factory/create-model';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';

/**
 * Builds a server validating a request body against a model schema with the
 * same options the application server uses. The `removeAdditional` option makes
 * the validator strip every property that the schema it matches does not
 * declare, which silently drops nested relation fields when the request schema
 * is built from a union of narrower object schemas.
 */
async function server(schemaName: string): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: { removeAdditional: 'all' },
      plugins: [(ajv): any => ajv.addKeyword('example')]
    }
  });

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
      defineModels({ type: 'all', create: true, update: true });
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

    test('strips the fields that the related model does not declare', async () => {
      app = await server('UserUpdate');

      const { body } = await validated(app, {
        posts: [{ id: 1, unknownField: 'x' }]
      });

      expect(body.posts).toEqual([{ id: 1 }]);
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

    test('strips the data of a relation that only connects records', async () => {
      app = await server('UserUpdate');

      const { body } = await validated(app, {
        posts: [{ id: 1, title: 'Renamed' }]
      });

      expect(body.posts).toEqual([{ id: 1 }]);
    });
  });
});
