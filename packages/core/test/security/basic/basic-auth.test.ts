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

import * as common from '@appweaver/common';
import { AuthSource, AuthType, ErrorCode } from '@appweaver/common';
import { define } from '../../../context';
import { AuthError } from '../../../security/auth-error';
import { AuthService } from '../../../security/auth-service';
import { basicAuth, hasBasicAuth } from '../../../security/basic/basic-auth';
import { Server } from '../../../types';
import { resetContext } from '../../fixtures/context-fixture';
import {
  addMeRoute,
  authUser,
  createTestServer
} from '../../fixtures/server-fixture';

const configOverrides: Record<string, unknown> = (common as any)
  .configOverrides;

const credentials = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

describe('basic-auth', () => {
  let server: Server;
  let authenticate: jest.Mock;

  const getMe = (authorization?: string) =>
    server.inject({
      method: 'GET',
      url: '/me',
      headers: authorization ? { authorization } : {}
    });

  async function startServer(routeConfig: Record<string, unknown> = {}) {
    server = createTestServer();
    server.register(basicAuth);
    addMeRoute(server, (s) => s.basicAuth, routeConfig);
    await server.ready();
  }

  beforeEach(() => {
    resetContext();
    authenticate = jest.fn().mockImplementation(async (username, password) => {
      if (username !== 'user@test.com' || password !== 'secret') {
        throw new AuthError(
          ErrorCode.AuthInvalidCredentials,
          'Invalid user credentials'
        );
      }
      return authUser();
    });
    define(
      { authenticate, authorize: AuthService.prototype.authorize },
      AuthService
    );
  });

  afterEach(async () => {
    await server?.close();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('basicAuth', () => {
    test('authenticates valid credentials', async () => {
      await startServer();

      const response = await getMe(credentials('user@test.com', 'secret'));

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        user: expect.objectContaining({ id: 1 }),
        type: AuthType.Basic,
        source: AuthSource.Password
      });
      expect(authenticate).toHaveBeenCalledWith('user@test.com', 'secret');
    });

    test('keeps a colon that is part of the password', async () => {
      authenticate.mockResolvedValue(authUser());
      await startServer();

      await getMe(credentials('user@test.com', 'pass:word'));

      expect(authenticate).toHaveBeenCalledWith('user@test.com', 'pass:word');
    });

    test('rejects invalid credentials with a challenge', async () => {
      await startServer();

      const response = await getMe(credentials('user@test.com', 'wrong'));

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toMatch(/^Basic /);
      expect(response.json().detail).toBe('Invalid user credentials');
    });

    test('rejects a request without credentials', async () => {
      await startServer();

      const response = await getMe();

      expect(response.statusCode).toBe(401);
      expect(authenticate).not.toHaveBeenCalled();
    });

    test('names the configured realm in the challenge', async () => {
      configOverrides.SECURITY_BASIC_REALM = 'Appweaver';
      await startServer();

      const response = await getMe(credentials('user@test.com', 'wrong'));

      expect(response.headers['www-authenticate']).toMatch(
        /^Basic realm="Appweaver"/
      );
    });

    test('answers with a proxy challenge in proxy mode', async () => {
      configOverrides.SECURITY_BASIC_PROXY_MODE = true;
      await startServer();

      const response = await server.inject({
        method: 'GET',
        url: '/me',
        headers: {
          'proxy-authorization': credentials('user@test.com', 'wrong')
        }
      });

      expect(response.statusCode).toBe(407);
      expect(response.headers['proxy-authenticate']).toMatch(/^Basic /);
    });

    test('rejects a user without the required role', async () => {
      await startServer({ roles: ['Admin'] });

      const response = await getMe(credentials('user@test.com', 'secret'));

      expect(response.statusCode).toBe(403);
    });

    test('rejects a disabled user returned by the authentication', async () => {
      authenticate.mockResolvedValue(authUser({ enabled: false }));
      await startServer();

      const response = await getMe(credentials('user@test.com', 'secret'));

      expect(response.statusCode).toBe(401);
    });
  });

  describe('hasBasicAuth', () => {
    const request = (authorization?: string) =>
      ({ headers: authorization ? { authorization } : {} }) as any;

    test('detects a basic authorization header in any case', () => {
      expect(hasBasicAuth(request('Basic dXNlcjpwYXNz'))).toBe(true);
      expect(hasBasicAuth(request('basic dXNlcjpwYXNz'))).toBe(true);
    });

    test('ignores other or missing authorization headers', () => {
      expect(hasBasicAuth(request('Bearer token'))).toBe(false);
      expect(hasBasicAuth(request())).toBe(false);
    });
  });
});
