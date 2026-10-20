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
import caching from '../../cache/caching';
import { resetContext } from '@appweaver/testing';

const user: AuthUser = { id: 1, email: 'user@test.com', roles: [] };

describe('caching', () => {
  let app: FastifyInstance;
  let store: Map<string, any>;
  let cacheService: Record<string, jest.Mock>;
  let handler: jest.Mock;

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
          setAuthContext({ authUser });
          return new AsyncResource('appweaver-request');
        })
    });
    app.register(caching);
    app.route({
      method,
      url: '/posts',
      config,
      handler: async (_request, reply) =>
        reply.code(status).send({ calls: handler() })
    });
    await app.ready();
  }

  const send = async (method: 'GET' | 'POST' | 'PUT' = 'GET') => {
    const response = await app.inject({ method, url: '/posts', payload: {} });
    return { status: response.statusCode, body: response.json() };
  };

  beforeEach(() => {
    resetContext();
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

  test('serves a repeated request from the cache', async () => {
    await server({ cache: true, cacheTTL: 5000 });

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
    ['caching disabled', { cache: false, cacheTTL: 5000 }, 'GET'],
    ['a zero TTL', { cacheTTL: 0, cacheKey: 'posts' }, 'GET'],
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
    await server({ cacheKey });

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
    await server({ cache: true, public: true, cacheModelName: 'Post' });

    await send();

    expect(cacheService.buildCacheKey).toHaveBeenCalledWith(
      expect.objectContaining({
        baseKey: 'req',
        modelName: 'Post',
        authUser: undefined
      })
    );
  });
});
