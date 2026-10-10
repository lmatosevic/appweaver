import {
  AuthSource,
  AuthType,
  Database,
  makeHash,
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_TYPE
} from '@appweaver/common';
import { context, define } from '../../../context';
import { CacheService } from '../../../cache';
import { AuthService } from '../../../security/auth-service';
import { apiKeyAuth, hasApiKey } from '../../../security/api-key/api-key-auth';
import { Server } from '../../../types';
import { resetContext } from '../../fixtures/context-fixture';
import {
  addMeRoute,
  authUser,
  createTestServer
} from '../../fixtures/server-fixture';

const SECRET = 'a1b2c3d4e5f6';

describe('api-key-auth', () => {
  let server: Server;
  let findFirst: jest.Mock;
  let findById: jest.Mock;
  let cache: Map<string, unknown>;

  const apiKey = (overrides: Record<string, unknown> = {}) => ({
    id: 5,
    keyHash: makeHash(SECRET),
    enabled: true,
    expiresAt: null,
    userId: 1,
    ...overrides
  });

  const getMe = (key?: string) =>
    server.inject({
      method: 'GET',
      url: '/me',
      headers: key !== undefined ? { 'x-api-key': key } : {}
    });

  async function startServer(routeConfig: Record<string, unknown> = {}) {
    server = createTestServer();
    server.register(apiKeyAuth);
    addMeRoute(server, (s) => s.authenticateApiKey, routeConfig);
    await server.ready();
  }

  beforeEach(() => {
    resetContext();

    context.resource.models.set('User', {
      name: 'User',
      [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
      [RESOURCE_AUTH]: true
    } as any);

    findFirst = jest.fn().mockResolvedValue(apiKey());
    define({ client: () => ({ apiKey: { findFirst } }) }, Database as any);

    cache = new Map();
    define(
      {
        buildCacheKey: ({ baseKey }: { baseKey: string }) => baseKey,
        getCachedValue: async (key: string) => cache.get(key) ?? null,
        addToCache: async (key: string, value: unknown) => {
          cache.set(key, value);
          return true;
        }
      },
      CacheService
    );

    findById = jest.fn().mockResolvedValue(authUser());
    define(
      { findById, authorize: AuthService.prototype.authorize },
      AuthService
    );
  });

  afterEach(async () => {
    await server?.close();
  });

  afterAll(() => {
    resetContext();
  });

  describe('apiKeyAuth', () => {
    describe('authenticateApiKey', () => {
      beforeEach(async () => {
        await startServer();
      });

      test('authenticates the owner of a valid key', async () => {
        const response = await getMe(`5AK${SECRET}`);

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          user: expect.objectContaining({ id: 1 }),
          type: AuthType.ApiKey,
          source: AuthSource.ApiKey
        });
        expect(findFirst).toHaveBeenCalledWith({ where: { id: 5 } });
        expect(findById).toHaveBeenCalledWith(1);
      });

      test('trims the whitespace around the key', async () => {
        const response = await getMe(`  5AK${SECRET}  `);

        expect(response.statusCode).toBe(200);
      });

      test('keeps a delimiter that is part of the secret', async () => {
        findFirst.mockResolvedValue(apiKey({ keyHash: makeHash('abcAKdef') }));

        const response = await getMe('5AKabcAKdef');

        expect(response.statusCode).toBe(200);
      });

      test('rejects a request without the key header', async () => {
        const response = await getMe();

        expect(response.statusCode).toBe(401);
        expect(response.json().detail).toBe(
          'Missing API key header: x-api-key'
        );
      });

      test('rejects an unknown key', async () => {
        findFirst.mockResolvedValue(null);

        const response = await getMe(`9AK${SECRET}`);

        expect(response.statusCode).toBe(401);
        expect(response.json().detail).toBe('Invalid API key');
      });

      test('rejects a key with a wrong secret', async () => {
        const response = await getMe('5AKwrong-secret');

        expect(response.statusCode).toBe(401);
        expect(findById).not.toHaveBeenCalled();
      });

      test('rejects a key without a secret', async () => {
        const response = await getMe('5');

        expect(response.statusCode).toBe(401);
      });

      test('rejects a disabled key', async () => {
        findFirst.mockResolvedValue(apiKey({ enabled: false }));

        const response = await getMe(`5AK${SECRET}`);

        expect(response.statusCode).toBe(401);
      });

      test('rejects an expired key', async () => {
        findFirst.mockResolvedValue(
          apiKey({ expiresAt: new Date(Date.now() - 1000) })
        );

        const response = await getMe(`5AK${SECRET}`);

        expect(response.statusCode).toBe(403);
        expect(response.json().detail).toBe('API key has expired');
      });

      test('accepts a key that expires in the future', async () => {
        findFirst.mockResolvedValue(
          apiKey({ expiresAt: new Date(Date.now() + 60_000) })
        );

        const response = await getMe(`5AK${SECRET}`);

        expect(response.statusCode).toBe(200);
      });

      test('rejects a key the database cannot look up', async () => {
        findFirst.mockRejectedValue(new Error('Invalid value for argument id'));

        const response = await getMe(`abcAK${SECRET}`);

        expect(response.statusCode).toBe(401);
        expect(response.json().detail).toBe('Invalid API key format');
      });

      test('rejects the key of a disabled owner', async () => {
        findById.mockResolvedValue(authUser({ enabled: false }));

        const response = await getMe(`5AK${SECRET}`);

        expect(response.statusCode).toBe(401);
      });

      test('caches a valid key', async () => {
        await getMe(`5AK${SECRET}`);
        const response = await getMe(`5AK${SECRET}`);

        expect(response.statusCode).toBe(200);
        expect(findFirst).toHaveBeenCalledTimes(1);
      });

      test('rejects a wrong secret for a cached key', async () => {
        expect((await getMe(`5AK${SECRET}`)).statusCode).toBe(200);

        const response = await getMe('5AKwrong-secret');

        expect(response.statusCode).toBe(401);
        expect(findById).toHaveBeenCalledTimes(1);
      });

      test('rejects a cached key that was disabled', async () => {
        cache.set('apikey:5', apiKey({ enabled: false }));

        const response = await getMe(`5AK${SECRET}`);

        expect(response.statusCode).toBe(401);
      });

      test('does not cache an unknown key', async () => {
        findFirst.mockResolvedValue(null);

        await getMe(`9AK${SECRET}`);

        expect(cache.size).toBe(0);
      });
    });

    describe('with a configured ApiKey model', () => {
      test('reads a string id prefix as a string', async () => {
        context.resource.models.set('ApiKey', {
          name: 'ApiKey',
          config: { id: { type: 'string', generator: 'cuid(2)' } },
          [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE
        } as any);
        await startServer();

        await getMe(`123AK${SECRET}`);

        expect(findFirst).toHaveBeenCalledWith({ where: { id: '123' } });
      });

      test('skips the soft deleted keys', async () => {
        context.resource.models.set('ApiKey', {
          name: 'ApiKey',
          config: { softDelete: true },
          [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE
        } as any);
        await startServer();

        await getMe(`5AK${SECRET}`);

        expect(findFirst).toHaveBeenCalledWith({
          where: { id: 5, deletedAt: null }
        });
      });
    });

    describe('with route roles', () => {
      test('rejects an owner without the required role', async () => {
        await startServer({ roles: ['Admin'] });

        const response = await getMe(`5AK${SECRET}`);

        expect(response.statusCode).toBe(403);
      });
    });
  });

  describe('hasApiKey', () => {
    test('detects the configured key header', () => {
      expect(hasApiKey({ headers: { 'x-api-key': '5AKsecret' } } as any)).toBe(
        true
      );
    });

    test('ignores a request without the key header', () => {
      expect(hasApiKey({ headers: {} } as any)).toBe(false);
      expect(hasApiKey({ headers: { 'x-api-key': '' } } as any)).toBe(false);
    });
  });
});
