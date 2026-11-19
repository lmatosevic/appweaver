import { createHash } from 'node:crypto';
import fastifyJwt from '@fastify/jwt';
import {
  AccountError,
  AuthError,
  AuthScope,
  AuthSource,
  configOverrides,
  createLogger,
  ErrorCode,
  Memory,
  SecurityStore,
  TemplateEngine
} from '@appweaver/common';
import { define, LocaleService } from '@appweaver/core';
import { InMemory, MemorySecurityStore } from '@appweaver/core/drivers';
import { resetContext } from '@appweaver/testing';
import { AuthService, Server, TwoFactorService } from '@appweaver/web';
import { startMcpApp, user } from '../fixtures/mcp-app';

const logger = createLogger('mcp');
const verifier = 'v'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const redirectUri = 'http://localhost:3333/callback';

describe('oauth-routes', () => {
  let server: Server;
  let authService: Record<string, jest.Mock>;
  let twoFactorService: Record<string, jest.Mock>;

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

  /** Goes back from the provider to the callback, with the query the provider adds. */
  const callbackOf = async (clientId: string, query = '') => {
    const login = await loginUrl(clientId);
    const callback = new URL(login.searchParams.get('redirectToUrl')!);
    return server.inject({
      url: `${callback.pathname}${callback.search}&token=ott${query}`
    });
  };

  /** The single-use state of the form of a page. */
  const stateOf = (page: string) =>
    /name="state" value="([^"]+)"/.exec(page)![1];

  const postStep = (state: string, fields: Record<string, string>) =>
    server.inject({
      method: 'POST',
      url: '/oauth/sign-in',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ state, ...fields }).toString()
    });

  const location = (response: { headers: Record<string, unknown> }) =>
    new URL(response.headers.location as string).searchParams;

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
    twoFactorService = {
      sendChallenge: jest.fn(async (_, { method }) => ({
        challengeId: `challenge-${method ?? 'Email'}`,
        method: method ?? 'Email',
        destination: method && method !== 'Email' ? null : 'u***@test.com',
        methods: ['Email', 'Totp']
      })),
      verifyChallenge: jest.fn(async () => ({ token: '2fa-ott' }))
    };
    define(twoFactorService, TwoFactorService);
    define(new LocaleService(), LocaleService);
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
        expect(response.body).toContain(
          'The client is unknown, or its redirect URI is not registered.'
        );
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

      authService.exchangeToken.mockRejectedValueOnce(
        new AuthError(ErrorCode.AuthUnauthorized, 'Disabled')
      );
      expect(
        Object.fromEntries(location(await callbackOf(clientId)))
      ).toMatchObject({
        error: 'access_denied',
        error_description: 'Disabled',
        state: 'xyz'
      });
      authService.exchangeToken.mockRejectedValueOnce(new Error('down'));
      expect(
        location(await callbackOf(clientId)).get('error_description')
      ).toBe('The sign-in failed');
    });

    test('rejects an unknown or used authorization request and form state', async () => {
      await start();

      for (const response of [
        await server.inject({ url: '/oauth/callback?request=unknown' }),
        await postStep('unknown', { password: 'secret' })
      ]) {
        expect(response.statusCode).toBe(400);
        expect(response.body).toContain('Sign-in failed');
        expect(response.body).toContain('Start again from your client.');
      }
    });

    test('asks for the password of an account to link, never framed nor cached', async () => {
      await start();
      const clientId = await register();

      const page = await callbackOf(clientId, '&passwordRequired=true');
      expect(page.statusCode).toBe(200);
      expect(page.headers).toMatchObject({
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'content-security-policy': "frame-ancestors 'none'"
      });
      expect(page.body).toContain('Confirm your password');
      expect(authService.exchangeToken).not.toHaveBeenCalled();

      authService.exchangeToken.mockResolvedValueOnce({
        accessToken: sign(AuthScope.Auth)
      });
      const state = stateOf(page.body);
      const back = await postStep(state, { password: 'secret' });

      expect(authService.exchangeToken).toHaveBeenCalledWith('ott', 'secret');
      expect(location(back).get('code')).toBeTruthy();
      // The state of a form is used once
      expect((await postStep(state, { password: 'secret' })).statusCode).toBe(
        400
      );
    });

    test('sends a wrong password back to the client, to start again', async () => {
      await start();
      const clientId = await register();
      const page = await callbackOf(clientId, '&passwordRequired=true');
      authService.exchangeToken.mockRejectedValueOnce(
        new AuthError(ErrorCode.AuthInvalidCredentials, 'Wrong password')
      );

      const back = await postStep(stateOf(page.body), { password: 'wrong' });

      expect(Object.fromEntries(location(back))).toMatchObject({
        error: 'access_denied',
        error_description: 'Wrong password'
      });
    });

    test('asks for the 2FA code of a user who must pass it, then issues the code', async () => {
      await start();
      const clientId = await register();
      authService.exchangeToken.mockResolvedValueOnce({
        accessToken: sign(AuthScope.TwoFA)
      });

      const page = await callbackOf(clientId);
      expect(page.body).toContain('Enter the code we sent to u***@test.com.');
      expect(page.body).toContain(
        '<option value="Email" selected>Email</option>'
      );
      expect(page.body).toContain(
        '<option value="Recovery">Recovery code</option>'
      );
      expect(twoFactorService.sendChallenge).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        {
          method: undefined,
          authSource: AuthSource.OAuth2Google,
          locale: undefined
        }
      );

      twoFactorService.verifyChallenge.mockRejectedValueOnce(
        new AccountError(ErrorCode.Account2FACodeInvalid, 'Invalid code', {
          attemptsLeft: 4
        })
      );
      const retry = await postStep(stateOf(page.body), {
        action: 'verify',
        code: '000000'
      });
      expect(retry.body).toContain('The code is not valid, try again.');

      authService.exchangeToken.mockResolvedValueOnce({
        accessToken: sign(AuthScope.Auth)
      });
      const back = await postStep(stateOf(retry.body), {
        action: 'verify',
        code: '123456'
      });
      expect(twoFactorService.verifyChallenge).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 1 }),
        'challenge-Email',
        '123456'
      );
      expect(authService.exchangeToken).toHaveBeenLastCalledWith('2fa-ott');
      expect(location(back).get('code')).toBeTruthy();
    });

    test('asks for the 2FA code after the password', async () => {
      await start();
      const clientId = await register();
      const page = await callbackOf(clientId, '&passwordRequired=true');
      authService.exchangeToken.mockResolvedValueOnce({
        accessToken: sign(AuthScope.TwoFA)
      });

      const next = await postStep(stateOf(page.body), { password: 'secret' });

      expect(next.body).toContain('Two-factor authentication');
    });

    test('sends a new code or switches the 2FA method', async () => {
      await start();
      const clientId = await register();
      authService.exchangeToken.mockResolvedValueOnce({
        accessToken: sign(AuthScope.TwoFA)
      });
      const page = await callbackOf(clientId);

      const app = await postStep(stateOf(page.body), {
        action: 'resend',
        method: 'Totp'
      });
      expect(app.body).toContain('Enter the code of your authenticator app.');
      const recovery = await postStep(stateOf(app.body), {
        action: 'resend',
        method: 'Recovery'
      });
      expect(recovery.body).toContain('Enter one of your recovery codes.');

      twoFactorService.sendChallenge.mockRejectedValueOnce(
        new AccountError(ErrorCode.Account2FAMethodNotEnabled, 'Not enabled', {
          enabledMethods: ['Email']
        })
      );
      const refused = await postStep(stateOf(recovery.body), {
        action: 'resend',
        method: 'Sms'
      });
      expect(refused.body).toContain('Not enabled');
      expect(refused.body).toContain(
        '<option value="Recovery" selected>Recovery code</option>'
      );
    });

    test('sends the client back after too many wrong codes, or for a disabled user', async () => {
      await start();
      const clientId = await register();
      authService.exchangeToken.mockResolvedValue({
        accessToken: sign(AuthScope.TwoFA)
      });

      twoFactorService.verifyChallenge.mockRejectedValueOnce(
        new AccountError(ErrorCode.Account2FATooManyAttempts, 'Too many', {
          maxAttempts: 5
        })
      );
      const page = await callbackOf(clientId);
      const tooMany = await postStep(stateOf(page.body), { code: '1' });
      expect(location(tooMany).get('error_description')).toBe('Too many');

      const other = await callbackOf(clientId);
      authService.findById.mockResolvedValueOnce({ ...user, enabled: false });
      const disabled = await postStep(stateOf(other.body), { code: '1' });
      expect(location(disabled).get('error_description')).toBe(
        'The user does not exist or is disabled'
      );
    });

    test('renders the template of a page when the application has one', async () => {
      const render = jest.fn(
        async (_: string, data: any) => `custom ${data.client}`
      );
      define(
        {
          hasTemplate: async (name: string) => name === 'mcp/sign-in.html',
          render
        },
        TemplateEngine
      );
      await start();
      const clientId = await register();

      const response = await server.inject({
        url: `/oauth/authorize?${new URLSearchParams(authorizeParams(clientId))}`,
        headers: { 'accept-language': 'de-AT,de;q=0.9' }
      });

      expect(response.body).toBe('custom Agent');
      expect(render).toHaveBeenCalledWith(
        'mcp/sign-in.html',
        expect.objectContaining({ host: 'localhost:3333' }),
        { locale: 'de-AT' }
      );
    });
  });
});
