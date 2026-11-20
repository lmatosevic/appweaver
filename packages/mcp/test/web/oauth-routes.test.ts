import { createHash } from 'node:crypto';
import fastifyJwt from '@fastify/jwt';
import {
  AuthError,
  AuthScope,
  AuthSource,
  configOverrides,
  createLogger,
  ErrorCode,
  Memory,
  SecurityStore
} from '@appweaver/common';
import { define } from '@appweaver/core';
import { InMemory, MemorySecurityStore } from '@appweaver/core/drivers';
import { resetContext } from '@appweaver/testing';
import { AuthService, Server } from '@appweaver/web';
import { startMcpApp, user } from '../fixtures/mcp-app';

const logger = createLogger('mcp');
const verifier = 'v'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const redirectUri = 'http://localhost:3333/callback';

describe('oauth-routes', () => {
  let server: Server;
  let authService: Record<string, jest.Mock>;

  const sign = (scope: AuthScope, sub: number = 1) =>
    server.jwt.sign({ scope, sub, source: AuthSource.OAuth2Google });

  const start = async (providers = [AuthSource.OAuth2Google]) => {
    const app = await startMcpApp(undefined, (instance) => {
      instance.register(fastifyJwt, { secret: 'jwt-secret' });
      for (const provider of providers) {
        instance.decorate(provider, {});
      }
    });
    server = app.server;
    return app;
  };

  const register = async () =>
    (
      await server.inject({
        method: 'POST',
        url: '/oauth/register',
        payload: { redirect_uris: [redirectUri], client_name: 'Agent' }
      })
    ).json().client_id as string;

  const authorize = (params: Record<string, string>) =>
    server.inject({
      method: 'GET',
      url: `/oauth/authorize?${new URLSearchParams(params)}`
    });

  const authorizeParams = (clientId: string) => ({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    resource: 'http://api.test/mcp'
  });

  /** The first sign-in link of the consent page of an authorization request. */
  const loginUrl = async (clientId: string) => {
    const page = (await authorize(authorizeParams(clientId))).body;
    const href = /href="([^"]+)"/.exec(page)![1].replaceAll('&amp;', '&');
    return new URL(href, 'http://api.test');
  };

  /** Runs the flow up to the redirect back to the client, returning its URL. */
  const signIn = async (clientId: string) => {
    const login = await loginUrl(clientId);
    const callback = new URL(login.searchParams.get('redirectToUrl')!);
    authService.exchangeToken.mockResolvedValue({
      accessToken: sign(AuthScope.Auth)
    });
    const response = await server.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}&token=ott`
    });
    return new URL(response.headers.location as string);
  };

  const token = (payload: Record<string, string>) =>
    server.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(payload).toString()
    });

  beforeEach(() => {
    resetContext();
    configOverrides.MCP_OAUTH2_ENABLED = true;
    configOverrides.APP_HOSTNAME = 'http://api.test';
    configOverrides.SECURITY_JWT_SECRET = 'jwt-secret';
    define(new InMemory(), Memory);
    define(new MemorySecurityStore(), SecurityStore);
    authService = {
      exchangeToken: jest.fn(),
      findById: jest.fn(async (id) => ({ ...user, id })),
      authorize: jest.fn(),
      generateAuthTokens: jest.fn(async () => ({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 3600
      }))
    };
    define(authService, AuthService);
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await server?.close();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('registerOAuthRoutes', () => {
    test('publishes the metadata of the resource and of the authorization server', async () => {
      await start();

      for (const url of [
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp'
      ]) {
        expect((await server.inject({ url })).json()).toMatchObject({
          resource: 'http://api.test/mcp',
          authorization_servers: ['http://api.test']
        });
      }
      expect(
        (
          await server.inject({
            url: '/.well-known/oauth-authorization-server'
          })
        ).json()
      ).toMatchObject({
        issuer: 'http://api.test',
        token_endpoint: 'http://api.test/oauth/token'
      });
    });

    test('challenges an unauthenticated MCP request with the resource metadata', async () => {
      await start();

      const response = await server.inject({
        method: 'POST',
        url: '/mcp',
        payload: { jsonrpc: '2.0', id: 1, method: 'ping' }
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe(
        'Bearer resource_metadata="http://api.test/.well-known/oauth-protected-resource/mcp"'
      );
    });

    test('registers nothing while disabled', async () => {
      configOverrides.MCP_OAUTH2_ENABLED = false;
      await start();

      const response = await server.inject({
        method: 'POST',
        url: '/mcp',
        payload: { jsonrpc: '2.0', id: 1, method: 'ping' }
      });

      expect(response.headers['www-authenticate']).toBeUndefined();
      expect(
        (
          await server.inject({
            url: '/.well-known/oauth-authorization-server'
          })
        ).statusCode
      ).toBe(404);
    });

    test('signs a user in with a provider and issues their tokens for the code', async () => {
      await start();
      const clientId = await register();

      const back = await signIn(clientId);
      expect(back.origin + back.pathname).toBe(redirectUri);
      expect(back.searchParams.get('state')).toBe('xyz');
      expect(back.searchParams.get('iss')).toBe('http://api.test');
      expect(authService.exchangeToken).toHaveBeenCalledWith('ott');

      const exchange = {
        grant_type: 'authorization_code',
        code: back.searchParams.get('code')!,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      };
      const response = await token(exchange);

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({
        access_token: 'access',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh'
      });
      expect(authService.generateAuthTokens).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        AuthScope.Auth,
        AuthSource.OAuth2Google
      );
      // A code is used once
      expect((await token(exchange)).json()).toMatchObject({
        error: 'invalid_grant'
      });
    });

    test('rejects a code of another client, redirect URI or verifier', async () => {
      await start();
      const clientId = await register();

      for (const wrong of [
        { client_id: 'other' },
        { redirect_uri: 'http://localhost/other' },
        { code_verifier: 'w'.repeat(64) }
      ]) {
        const back = await signIn(clientId);
        const response = await token({
          grant_type: 'authorization_code',
          code: back.searchParams.get('code')!,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: verifier,
          ...wrong
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe('invalid_grant');
      }
    });

    test('refreshes the tokens of a user not logged out since', async () => {
      await start();

      const response = await token({
        grant_type: 'refresh_token',
        refresh_token: sign(AuthScope.Refresh, 3)
      });

      expect(response.json()).toMatchObject({ access_token: 'access' });
      expect(authService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3 }),
        '/auth/refresh',
        {},
        expect.objectContaining({ scope: AuthScope.Refresh })
      );
    });

    test('rejects an invalid, a revoked or an access token as refresh token, and other grants', async () => {
      await start();
      const error = async (payload: Record<string, string>) =>
        (await token(payload)).json();

      await expect(
        error({ grant_type: 'refresh_token', refresh_token: 'nope' })
      ).resolves.toMatchObject({ error: 'invalid_grant' });
      await expect(
        error({
          grant_type: 'refresh_token',
          refresh_token: sign(AuthScope.Auth)
        })
      ).resolves.toEqual({
        error: 'invalid_grant',
        error_description: 'Not a refresh token'
      });
      authService.authorize.mockImplementationOnce(() => {
        throw new AuthError(ErrorCode.AuthUnauthorized, 'Logged out');
      });
      await expect(
        error({
          grant_type: 'refresh_token',
          refresh_token: sign(AuthScope.Refresh)
        })
      ).resolves.toMatchObject({
        error_description: 'The refresh token was revoked'
      });
      authService.findById.mockResolvedValueOnce({ ...user, enabled: false });
      await expect(
        error({
          grant_type: 'refresh_token',
          refresh_token: sign(AuthScope.Refresh)
        })
      ).resolves.toMatchObject({
        error_description: 'The user does not exist or is disabled'
      });
      await expect(error({ grant_type: 'password' })).resolves.toMatchObject({
        error: 'unsupported_grant_type'
      });
      await expect(error({})).resolves.toMatchObject({
        error: 'unsupported_grant_type'
      });
    });

    test('registers only clients of HTTPS or loopback redirect URIs', async () => {
      await start();

      for (const redirect_uris of [
        undefined,
        [],
        ['http://agent.test/cb'],
        Array(11).fill(redirectUri)
      ]) {
        const response = await server.inject({
          method: 'POST',
          url: '/oauth/register',
          payload: { redirect_uris }
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe('invalid_redirect_uri');
      }
      const response = await server.inject({
        method: 'POST',
        url: '/oauth/register',
        payload: { redirect_uris: ['https://agent.test/cb'] }
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).not.toHaveProperty('client_name');
    });

    test('never redirects to an unknown client or redirect URI', async () => {
      await start();
      const clientId = await register();

      for (const params of [
        { ...authorizeParams(clientId), client_id: 'unknown' },
        { ...authorizeParams(clientId), redirect_uri: 'https://evil.test' }
      ]) {
        const response = await authorize(params);
        expect(response.statusCode).toBe(400);
        expect(response.body).toContain('Invalid authorization request');
      }
    });

    test('redirects the errors of an authorization request to the client', async () => {
      await start();
      const clientId = await register();
      const error = async (params: Record<string, string>) =>
        new URL(
          (await authorize({ ...authorizeParams(clientId), ...params })).headers
            .location as string
        ).searchParams.get('error');

      await expect(error({ response_type: 'token' })).resolves.toBe(
        'unsupported_response_type'
      );
      await expect(error({ code_challenge_method: 'plain' })).resolves.toBe(
        'invalid_request'
      );
      await expect(error({ resource: 'https://other.test/mcp' })).resolves.toBe(
        'invalid_target'
      );
      configOverrides.MCP_OAUTH2_PROVIDERS = ['github'];
      await expect(error({})).resolves.toBe('temporarily_unavailable');
    });

    test('asks the user to sign in for the named client with a provider', async () => {
      await start([AuthSource.OAuth2Google, AuthSource.OAuth2Github]);
      const clientId = await register();

      const response = await authorize(authorizeParams(clientId));

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(
        'Agent of localhost:3333 asks to act as you'
      );
      expect(response.body).toContain('/auth/login/google?redirectToUrl=');
      expect(response.body).toContain('/auth/login/github?redirectToUrl=');
    });

    test('redirects a failed sign-in to the client', async () => {
      await start();
      const clientId = await register();
      const callbackOf = async () => {
        const login = await loginUrl(clientId);
        const callback = new URL(login.searchParams.get('redirectToUrl')!);
        const response = await server.inject({
          url: `${callback.pathname}${callback.search}&token=ott`
        });
        return new URL(response.headers.location as string).searchParams;
      };

      authService.exchangeToken.mockRejectedValueOnce(
        new AuthError(ErrorCode.AuthPasswordRequired, 'Password required')
      );
      expect(Object.fromEntries(await callbackOf())).toMatchObject({
        error: 'access_denied',
        error_description: 'Password required',
        state: 'xyz'
      });
      authService.exchangeToken.mockRejectedValueOnce(new Error('down'));
      expect((await callbackOf()).get('error_description')).toBe(
        'The sign-in failed'
      );
      authService.exchangeToken.mockResolvedValueOnce({
        accessToken: sign(AuthScope.TwoFA)
      });
      expect((await callbackOf()).get('error_description')).toBe(
        'The user must pass the two-factor authentication'
      );
    });

    test('rejects an unknown or used authorization request', async () => {
      await start();

      const response = await server.inject({
        url: '/oauth/callback?request=unknown&token=ott'
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Authorization expired');
    });
  });
});
