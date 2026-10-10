import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
import { AuthScope, AuthSource, AuthType } from '@appweaver/common';
import { define } from '../../../context';
import { AuthService } from '../../../security/auth-service';
import { hasBearerAuth, jwtAuth } from '../../../security/jwt/jwt-auth';
import { Server } from '../../../types';
import { resetContext } from '../../fixtures/context-fixture';
import {
  addMeRoute,
  authUser,
  createTestServer
} from '../../fixtures/server-fixture';

const configOverrides: Record<string, unknown> = (common as any)
  .configOverrides;

describe('jwt-auth', () => {
  let findById: jest.Mock;

  beforeEach(() => {
    resetContext();
    findById = jest.fn().mockResolvedValue(authUser());
    // The real authorization rules run against the stubbed user lookup
    define(
      { findById, authorize: AuthService.prototype.authorize },
      AuthService
    );
  });

  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('jwtAuth', () => {
    let server: Server;

    const sign = (payload: Record<string, unknown> = {}, options = {}) =>
      server.jwt.sign(
        {
          sub: 1,
          username: 'user@test.com',
          scope: AuthScope.Auth,
          source: AuthSource.Password,
          ...payload
        },
        options
      );

    const getMe = (token?: string) =>
      server.inject({
        method: 'GET',
        url: '/me',
        headers: token ? { authorization: `Bearer ${token}` } : {}
      });

    async function startServer(routeConfig: Record<string, unknown> = {}) {
      server = createTestServer();
      server.register(jwtAuth);
      addMeRoute(server, (s) => s.authenticateJWT, routeConfig);
      await server.ready();
    }

    describe('with a shared secret', () => {
      beforeEach(async () => {
        configOverrides.SECURITY_JWT_SECRET = 'test-secret';
        await startServer();
      });

      afterEach(async () => {
        await server.close();
      });

      test('authenticates the user of a valid access token', async () => {
        const response = await getMe(sign());

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          user: expect.objectContaining({ id: 1 }),
          type: AuthType.Jwt,
          source: AuthSource.Password
        });
        expect(findById).toHaveBeenCalledWith(1);
      });

      test('keeps the authentication source of the token', async () => {
        const response = await getMe(sign({ source: AuthSource.OAuth2Google }));

        expect(response.json().source).toBe(AuthSource.OAuth2Google);
      });

      test('rejects a request without a token', async () => {
        const response = await getMe();

        expect(response.statusCode).toBe(401);
        expect(findById).not.toHaveBeenCalled();
      });

      test('rejects a malformed token', async () => {
        const response = await getMe('not-a-token');

        expect(response.statusCode).toBe(401);
        expect(response.json().detail).toMatch(/^Authentication error/);
      });

      test('rejects a token signed with another secret', async () => {
        const other = createTestServer();
        configOverrides.SECURITY_JWT_SECRET = 'other-secret';
        other.register(jwtAuth);
        await other.ready();
        const forged = other.jwt.sign({ sub: 1, scope: AuthScope.Auth });
        await other.close();

        const response = await getMe(forged);

        expect(response.statusCode).toBe(401);
        expect(findById).not.toHaveBeenCalled();
      });

      test('rejects an expired token', async () => {
        const iat = Math.floor(Date.now() / 1000) - 120;
        const response = await getMe(sign({ iat, exp: iat + 60 }));

        expect(response.statusCode).toBe(401);
      });

      test('rejects the token when the user lookup fails', async () => {
        findById.mockRejectedValue(new Error('database down'));

        const response = await getMe(sign());

        expect(response.statusCode).toBe(401);
      });

      test('rejects the token of a missing user', async () => {
        findById.mockResolvedValue(null);

        const response = await getMe(sign());

        expect(response.statusCode).toBe(401);
        expect(response.json().detail).toBe('Unauthorized access');
      });

      test('rejects the token of a disabled user', async () => {
        findById.mockResolvedValue(authUser({ enabled: false }));

        const response = await getMe(sign());

        expect(response.statusCode).toBe(401);
      });

      test('rejects a token issued before the user logged out', async () => {
        const iat = Math.floor(Date.now() / 1000) - 60;
        findById.mockResolvedValue(authUser({ logoutAt: new Date() }));

        const response = await getMe(sign({ iat }));

        expect(response.statusCode).toBe(401);
      });

      test('accepts a token issued after the user logged out', async () => {
        findById.mockResolvedValue(
          authUser({ logoutAt: new Date(Date.now() - 60_000) })
        );

        const response = await getMe(sign());

        expect(response.statusCode).toBe(200);
      });

      test('rejects a refresh token on a regular route', async () => {
        const response = await getMe(sign({ scope: AuthScope.Refresh }));

        expect(response.statusCode).toBe(403);
      });

      test('rejects a 2FA token on a regular route', async () => {
        const response = await getMe(sign({ scope: AuthScope.TwoFA }));

        expect(response.statusCode).toBe(403);
      });

      test('rejects a token with an unknown scope', async () => {
        const response = await getMe(sign({ scope: 'admin' }));

        expect(response.statusCode).toBe(403);
      });
    });

    describe('with route roles and permissions', () => {
      beforeEach(async () => {
        configOverrides.SECURITY_JWT_SECRET = 'test-secret';
        await startServer({ roles: ['Admin'], permissions: ['manage'] });
      });

      afterEach(async () => {
        await server.close();
      });

      test('rejects a user without the required role', async () => {
        const response = await getMe(sign());

        expect(response.statusCode).toBe(403);
        expect(response.json().detail).toBe('Forbidden access');
      });

      test('rejects a user with the role but without the permission', async () => {
        findById.mockResolvedValue(
          authUser({ roles: [{ name: 'Admin', permissions: [] }] as any })
        );

        const response = await getMe(sign());

        expect(response.statusCode).toBe(403);
      });

      test('accepts a user with the required role and permission', async () => {
        findById.mockResolvedValue(
          authUser({
            roles: [{ name: 'Admin', permissions: [{ name: 'manage' }] }] as any
          })
        );

        const response = await getMe(sign());

        expect(response.statusCode).toBe(200);
      });
    });

    describe('with a key pair', () => {
      let tempDir: string;

      beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-jwt-'));
        configOverrides.SECURITY_JWT_SECRET = undefined;
        configOverrides.SECURITY_JWT_PUBLIC_KEY_PATH = path.join(
          tempDir,
          'keys',
          'public.pem'
        );
        configOverrides.SECURITY_JWT_PRIVATE_KEY_PATH = path.join(
          tempDir,
          'keys',
          'private.pem'
        );
      });

      afterEach(async () => {
        await server?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
      });

      test('generates the missing keys and signs with RS256', async () => {
        configOverrides.SECURITY_JWT_AUTO_GENERATE_KEYS = true;
        await startServer();

        const token = sign();
        const header = JSON.parse(
          Buffer.from(token.split('.')[0], 'base64url').toString()
        );

        expect(header.alg).toBe('RS256');
        expect(
          fs.existsSync(configOverrides.SECURITY_JWT_PRIVATE_KEY_PATH as string)
        ).toBe(true);
        expect((await getMe(token)).statusCode).toBe(200);
      });

      test('fails to start when the keys are missing and generating them is off', async () => {
        configOverrides.SECURITY_JWT_AUTO_GENERATE_KEYS = false;

        await expect(startServer()).rejects.toThrow();
      });
    });
  });

  describe('hasBearerAuth', () => {
    const request = (authorization?: string) =>
      ({ headers: authorization ? { authorization } : {} }) as any;

    test('detects a bearer authorization header in any case', () => {
      expect(hasBearerAuth(request('Bearer token'))).toBe(true);
      expect(hasBearerAuth(request('bearer token'))).toBe(true);
    });

    test('ignores other or missing authorization headers', () => {
      expect(hasBearerAuth(request('Basic dXNlcjpwYXNz'))).toBe(false);
      expect(hasBearerAuth(request())).toBe(false);
    });
  });
});
