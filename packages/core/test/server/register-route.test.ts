import Fastify, { FastifyInstance } from 'fastify';
import { ROUTE } from '@appweaver/common';
import { context } from '../../context';
import { ProblemDetailsSchema } from '../../errors';
import { registerRoute } from '../../server/register-route';
import { resetContext } from '../fixtures/context-fixture';

describe('register-route', () => {
  let server: FastifyInstance;

  /** Copies the registered routes to a server, as the application does. */
  const buildRoutes = async () => {
    const builders = context.definitions
      .filter((definition) => definition.name === ROUTE)
      .map((definition) => definition.value as (server: any) => Promise<void>);

    for (const builder of builders) {
      await builder(server);
    }

    await server.ready();
  };

  beforeEach(() => {
    resetContext();

    server = Fastify({ logger: false });
    server.addSchema(ProblemDetailsSchema);
    server.decorate('authenticate', () => async () => {});
    server.decorate('recaptcha', async () => {});
  });

  afterEach(async () => {
    await server.close();
  });

  afterAll(() => {
    resetContext();
  });

  describe('registerRoute', () => {
    test('registers a GET route together with its HEAD route', async () => {
      registerRoute(
        (router) => {
          router.get('/ping', async () => ({ pong: true }));
        },
        { public: true }
      );

      await buildRoutes();

      const get = await server.inject({ method: 'GET', url: '/ping' });
      expect(get.statusCode).toBe(200);
      expect(get.json()).toEqual({ pong: true });

      const head = await server.inject({ method: 'HEAD', url: '/ping' });
      expect(head.statusCode).toBe(200);
    });

    test('registers the routes of the other methods', async () => {
      registerRoute(
        (router) => {
          router.post('/items', async () => ({ created: true }));
          router.delete('/items/:id', async () => ({ deleted: true }));
        },
        { public: true }
      );

      await buildRoutes();

      const post = await server.inject({ method: 'POST', url: '/items' });
      expect(post.json()).toEqual({ created: true });

      const del = await server.inject({ method: 'DELETE', url: '/items/1' });
      expect(del.json()).toEqual({ deleted: true });
    });
  });
});
