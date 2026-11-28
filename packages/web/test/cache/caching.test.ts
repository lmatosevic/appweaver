import { AsyncResource } from 'node:async_hooks';
import Fastify, { FastifyInstance } from 'fastify';
import { fastifyRequestContext } from '@fastify/request-context';
import { AuthUser } from '@appweaver/common';
import {
  define,
  runInAuthContext,
  setAuthContext,
  CacheService
} from '@appweaver/core';
import { gunzipSync } from 'node:zlib';
import caching from '../../cache/caching';
import { registerCompression } from '../../server/compression';
import { resetContext } from '@appweaver/testing';

const user: AuthUser = { id: 1, email: 'user@test.com', roles: [] };

describe('caching', () => {
  let app: FastifyInstance;
  let store: Map<string, any>;
  let cacheService: Record<string, jest.Mock>;
  let handler: jest.Mock;
  // The user of the next requests, when it changes between them
  let setUser: AuthUser | undefined;

  /** Mounts the caching plugin over a route answering with its call count. */
  async function server(
    config: Record<string, unknown>,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    status: number = 200,
    authUser: AuthUser | null = user
  ): Promise<void> {
    app = Fastify({ logger: false });
    app.register(fastifyRequestContext, {
      defaultStoreValues: { cached: undefined },
      createAsyncResource: () =>
        runInAuthContext(() => {
          setAuthContext({ authUser: setUser ?? authUser });
          return new AsyncResource('appweaver-request');
        })
    });
    app.register(caching);
    app.after(() => {
      app.route({
        method,
        url: '/posts',
        config,
        handler: async (_request, reply) =>
          reply.code(status).send({ calls: handler() })
      });
    });
    await app.ready();
  }

  const send = async (method: 'GET' | 'POST' | 'PUT' = 'GET') => {
    const response = await app.inject({ method, url: '/posts', payload: {} });
    return { status: response.statusCode, body: response.json() };
  };

  beforeEach(() => {
    resetContext();
    setUser = undefined;
    store = new Map();
    let calls = 0;
    handler = jest.fn(() => ++calls);
    cacheService = {
      buildCacheKey: jest.fn(({ method, url }) => `${method}:${url}`),
      getCachedValue: jest.fn(async (key: string) => store.get(key)),
      addToCache: jest.fn(async (key: string, value: any) => {
        store.set(key, value);
      })
    };
    define(cacheService, CacheService);
  });

  afterEach(async () => {
    await app?.close();
  });

  afterAll(() => {
    resetContext();
  });

  test('stores a payload uncompressed and compresses every reply of it', async () => {
    const big = 'x'.repeat(4096);
    app = Fastify({ logger: false });
    registerCompression(app);
    app.register(fastifyRequestContext, {
      defaultStoreValues: { cached: undefined },
      createAsyncResource: () =>
        runInAuthContext(() => {
          setAuthContext({ authUser: user });
          return new AsyncResource('appweaver-request');
        })
    });
    app.register(caching);
    app.after(() => {
      app.get('/posts', { config: { cache: true } }, async () => ({
        calls: handler(),
        big
      }));
    });
    await app.ready();
    const get = () =>
      app.inject({ url: '/posts', headers: { 'accept-encoding': 'gzip' } });

    const first = await get();
    const second = await get();

    expect(handler).toHaveBeenCalledTimes(1);
    for (const response of [first, second]) {
      expect(response.headers['content-encoding']).toBe('gzip');
      expect(JSON.parse(gunzipSync(response.rawPayload).toString())).toEqual({
        calls: 1,
        big
      });
    }
    const [stored] = [...store.values()];
    expect(JSON.parse(stored.payload)).toEqual({ calls: 1, big });
    expect(stored.headers['content-encoding']).toBeUndefined();
  });

  test('serves a repeated request from the cache', async () => {
    await server({ cache: { ttl: 5000 } });

    const first = await send();
    const second = await send();

    expect(first).toEqual({ status: 200, body: { calls: 1 } });
    expect(second).toEqual(first);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(cacheService.addToCache).toHaveBeenCalledTimes(1);
    expect(cacheService.addToCache).toHaveBeenCalledWith(
      'GET:/posts',
      expect.objectContaining({ statusCode: 200 }),
      5000
    );
  });

  test.each([
    ['no cache option', {}, 'GET'],
    ['caching disabled', { cache: false }, 'GET'],
    ['a zero TTL', { cache: { ttl: 0, key: 'posts' } }, 'GET'],
    ['a write method', { cache: true }, 'PUT']
  ] as const)('skips a route with %s', async (_name, config, method) => {
    await server(config, method);

    await send(method);
    await send(method);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(cacheService.getCachedValue).not.toHaveBeenCalled();
  });

  test('does not cache an unsuccessful response', async () => {
    await server({ cache: true }, 'POST', 404);

    await send('POST');
    await send('POST');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(cacheService.addToCache).not.toHaveBeenCalled();
  });

  test('uses the cache key of the route config', async () => {
    const cacheKey = jest.fn(() => 'posts:custom');
    await server({ cache: { key: cacheKey } });

    await send();

    expect(cacheKey).toHaveBeenCalledWith(expect.anything(), user);
    expect(store.has('posts:custom')).toBe(true);
    expect(cacheService.buildCacheKey).not.toHaveBeenCalled();
  });

  test('builds the key without the user of an unauthenticated request', async () => {
    await server({ cache: true }, 'GET', 200, null);

    const response = await send();

    expect(response.status).toBe(200);
    expect(cacheService.buildCacheKey).toHaveBeenCalledWith(
      expect.objectContaining({ authUser: undefined })
    );
  });

  test('builds the key without the user on a public route', async () => {
    await server({ cache: { modelName: 'Post' }, public: true });

    await send();

    expect(cacheService.buildCacheKey).toHaveBeenCalledWith(
      expect.objectContaining({
        baseKey: 'req',
        modelName: 'Post',
        authUser: undefined
      })
    );
  });

  test('builds the key of the user scope with the user', async () => {
    await server({ cache: { scope: 'user' } });

    await send();

    expect(cacheService.buildCacheKey).toHaveBeenCalledWith(
      expect.objectContaining({ baseKey: 'req', authUser: user })
    );
  });

  test('builds one key of the shared scope for every user', async () => {
    await server({ cache: { scope: 'shared', ttl: 1000 } });

    const first = await send();
    setUser = { ...user, id: 2 };
    const second = await send();

    expect(second).toEqual(first);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(cacheService.buildCacheKey).toHaveBeenCalledWith(
      expect.objectContaining({ baseKey: 'req:shared', authUser: undefined })
    );
  });

  test('refuses the public scope on an authenticated route', async () => {
    app = Fastify({ logger: false });
    app.register(caching);
    app.register(async (scope) => {
      scope.get(
        '/posts',
        { config: { cache: { scope: 'public' } } },
        async () => ({})
      );
    });

    await expect(app.ready()).rejects.toMatchObject({
      code: 'CONFIGURATION_INVALID'
    });
  });

  test('replays only the headers describing the payload', async () => {
    app = Fastify({ logger: false });
    app.register(fastifyRequestContext, {
      defaultStoreValues: { cached: undefined }
    });
    app.register(caching);
    app.get(
      '/posts',
      { config: { cache: true, public: true } },
      async (request, reply) =>
        reply
          .header('access-control-allow-origin', request.headers.origin)
          .header('x-request-id', String(request.id))
          .header('etag', '"v1"')
          .send({ calls: handler() })
    );
    await app.ready();

    await app.inject({
      url: '/posts',
      headers: { origin: 'https://a.example' }
    });
    const cached = await app.inject({
      url: '/posts',
      headers: { origin: 'https://b.example' }
    });

    expect(cached.json()).toEqual({ calls: 1 });
    expect(cached.headers['etag']).toBe('"v1"');
    expect(cached.headers['content-type']).toMatch(/application\/json/);
    expect(cached.headers['access-control-allow-origin']).toBeUndefined();
    expect(cached.headers['x-request-id']).toBeUndefined();
    expect(Object.keys(store.values().next().value.headers).sort()).toEqual([
      'content-type',
      'etag'
    ]);
  });

  test('builds the key of a request once', async () => {
    await server({ cache: { ttl: 5000 } });

    await send();

    expect(cacheService.buildCacheKey).toHaveBeenCalledTimes(1);
  });
});
