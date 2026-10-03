jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  const configOverrides: Record<string, unknown> = {};
  return {
    __esModule: true,
    ...actual,
    configOverrides,
    get config() {
      return { ...actual.config, ...configOverrides };
    }
  };
});

// Each handler accepts a single valid credential, so the test covers how the
// `authenticate` decorator combines them rather than the handlers themselves
jest.mock('../../security/jwt', () => {
  const fp = jest.requireActual('fastify-plugin');
  const { requestContext } = jest.requireActual('@fastify/request-context');
  const { HttpError } = jest.requireActual('../../errors');
  const actual = jest.requireActual('../../security/jwt/jwt-auth');
  return {
    hasBearerAuth: actual.hasBearerAuth,
    jwtAuth: fp(async (server: any) => {
      server.decorate('authenticateJWT', async (request: any) => {
        if (request.headers.authorization !== 'Bearer valid') {
          throw new HttpError('Invalid JWT', 401);
        }
        requestContext.set('authUser', { id: 1, via: 'jwt' });
      });
    })
  };
});

jest.mock('../../security/api-key', () => {
  const fp = jest.requireActual('fastify-plugin');
  const { requestContext } = jest.requireActual('@fastify/request-context');
  const { HttpError } = jest.requireActual('../../errors');
  const actual = jest.requireActual('../../security/api-key/api-key-auth');
  return {
    hasApiKey: actual.hasApiKey,
    apiKeyAuth: fp(async (server: any) => {
      server.decorate('authenticateApiKey', async (request: any) => {
        if (request.headers['x-api-key'] !== 'valid') {
          throw new HttpError('Invalid API key', 401);
        }
        requestContext.set('authUser', { id: 2, via: 'apiKey' });
      });
    })
  };
});

jest.mock('../../security/basic', () => {
  const fp = jest.requireActual('fastify-plugin');
  const { requestContext } = jest.requireActual('@fastify/request-context');
  const { HttpError } = jest.requireActual('../../errors');
  const actual = jest.requireActual('../../security/basic/basic-auth');
  return {
    hasBasicAuth: actual.hasBasicAuth,
    // Callback based like the hook of @fastify/basic-auth
    basicAuth: fp(async (server: any) => {
      server.decorate('basicAuth', (request: any, _: any, done: any) => {
        if (request.headers.authorization !== 'Basic valid') {
          return done(new HttpError('Invalid credentials', 401));
        }
        requestContext.set('authUser', { id: 3, via: 'basic' });
        done();
      });
    })
  };
});

jest.mock('../../security/recaptcha', () => ({
  recaptcha: jest.requireActual('fastify-plugin')(async (server: any) => {
    server.decorate('recaptcha', async () => undefined);
  })
}));

jest.mock('../../security/auth-routes', () => ({
  authRoutes: async () => undefined
}));

jest.mock('../../security/account', () => ({
  accountRoutes: async () => undefined
}));

jest.mock('../../security/oauth2', () => ({
  extractTestUserInfo: jest.fn(),
  testOAuth2: jest.requireActual('fastify-plugin')(async (server: any) => {
    server.decorate('testOAuth2', true);
  })
}));

import * as common from '@appweaver/common';
import { AuthType } from '@appweaver/common';
import * as oauth2 from '../../security/oauth2';
import auth from '../../security/auth';
import { Server } from '../../types';
import { addMeRoute, createTestServer } from '../fixtures/server-fixture';

const configOverrides: Record<string, unknown> = (common as any)
  .configOverrides;

describe('auth', () => {
  let server: Server;

  async function startServer(authTypes?: AuthType[]) {
    server = createTestServer();
    server.register(auth);
    addMeRoute(server, (s) => s.authenticate(authTypes));
    server.after(() => {
      server.get('/current-user', async () => ({ user: server.currentUser() }));
      server.get('/authenticated-user', {
        onRequest: server.authenticate(),
        handler: async () => ({ user: server.currentUser() })
      });
    });
    await server.ready();
  }

  const getMe = (headers: Record<string, string> = {}) =>
    server.inject({ method: 'GET', url: '/me', headers });

  afterEach(async () => {
    await server?.close();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('plugin registration', () => {
    test('registers only the JWT handler by default', async () => {
      await startServer();

      expect(server.hasDecorator('authenticateJWT')).toBe(true);
      expect(server.hasDecorator('authenticateApiKey')).toBe(false);
      expect(server.hasDecorator('basicAuth')).toBe(false);
      expect(server.hasDecorator('recaptcha')).toBe(false);
    });

    test('registers the enabled handlers', async () => {
      configOverrides.SECURITY_API_KEY_ENABLED = true;
      configOverrides.SECURITY_BASIC_ENABLED = true;
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      await startServer();

      expect(server.hasDecorator('authenticateApiKey')).toBe(true);
      expect(server.hasDecorator('basicAuth')).toBe(true);
      expect(server.hasDecorator('recaptcha')).toBe(true);
    });

    test('registers the OAuth2 plugins but not the other exports', async () => {
      await startServer();

      expect(server.hasDecorator('testOAuth2')).toBe(true);
      expect((oauth2 as any).extractTestUserInfo).not.toHaveBeenCalled();
    });
  });

  describe('authenticate', () => {
    test('rejects a request without credentials', async () => {
      await startServer();

      const response = await getMe();

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Unauthorized');
    });

    test('authenticates a valid JWT', async () => {
      await startServer();

      const response = await getMe({ authorization: 'Bearer valid' });

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toEqual({ id: 1, via: 'jwt' });
    });

    test('rejects an invalid JWT with the error of its handler', async () => {
      await startServer();

      const response = await getMe({ authorization: 'Bearer forged' });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid JWT');
    });

    test('ignores an API key while the API keys are disabled', async () => {
      await startServer();

      const response = await getMe({ 'x-api-key': 'valid' });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Unauthorized');
    });

    test('authenticates a valid API key when enabled', async () => {
      configOverrides.SECURITY_API_KEY_ENABLED = true;
      await startServer();

      const response = await getMe({ 'x-api-key': 'valid' });

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toEqual({ id: 2, via: 'apiKey' });
    });

    test('rejects a request when any presented credential is invalid', async () => {
      configOverrides.SECURITY_API_KEY_ENABLED = true;
      await startServer();

      const response = await getMe({
        authorization: 'Bearer valid',
        'x-api-key': 'forged'
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid API key');
    });

    test('ignores basic credentials while basic auth is disabled', async () => {
      await startServer();

      const response = await getMe({ authorization: 'Basic valid' });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Unauthorized');
    });

    test('authenticates valid basic credentials when enabled', async () => {
      configOverrides.SECURITY_BASIC_ENABLED = true;
      await startServer();

      const response = await getMe({ authorization: 'Basic valid' });

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toEqual({ id: 3, via: 'basic' });
    });

    test('rejects invalid basic credentials when enabled', async () => {
      configOverrides.SECURITY_BASIC_ENABLED = true;
      await startServer();

      const response = await getMe({ authorization: 'Basic forged' });

      expect(response.statusCode).toBe(401);
    });

    test('keeps the JWT working while basic auth is enabled', async () => {
      configOverrides.SECURITY_BASIC_ENABLED = true;
      await startServer();

      const response = await getMe({ authorization: 'Bearer valid' });

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toEqual({ id: 1, via: 'jwt' });
    });

    test('accepts only the listed authentication types', async () => {
      configOverrides.SECURITY_API_KEY_ENABLED = true;
      await startServer([AuthType.ApiKey]);

      expect((await getMe({ authorization: 'Bearer valid' })).statusCode).toBe(
        401
      );
      expect((await getMe({ 'x-api-key': 'valid' })).statusCode).toBe(200);
    });

    test('rejects a listed type that is disabled', async () => {
      await startServer([AuthType.ApiKey]);

      const response = await getMe({ 'x-api-key': 'valid' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('currentUser', () => {
    test('throws when no user is authenticated', async () => {
      await startServer();

      const response = await server.inject({
        method: 'GET',
        url: '/current-user'
      });

      expect(response.statusCode).toBe(401);
    });

    test('returns the authenticated user', async () => {
      await startServer();

      const response = await server.inject({
        method: 'GET',
        url: '/authenticated-user',
        headers: { authorization: 'Bearer valid' }
      });

      expect(response.json().user).toEqual({ id: 1, via: 'jwt' });
    });
  });
});
