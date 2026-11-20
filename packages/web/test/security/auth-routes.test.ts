import Fastify, { RouteOptions } from 'fastify';
import { configOverrides, ErrorCode, Memory } from '@appweaver/common';
import { define } from '@appweaver/core';
import { InMemory } from '@appweaver/core/drivers';
import { errorHandler } from '../../errors/error-handler';
import {
  authRouteCaptcha,
  authRoutes,
  registerExchangeTokenRoute
} from '../../security/auth-routes';
import { AuthService } from '../../security/auth-service';
import { CaptchaAuthRoute } from '../../security/security-config';
import { requestValidation } from '../../server/request-validation';
import schemas from '../../server/schemas';
import { Server } from '../../types/server';

describe('auth-routes', () => {
  let server: Server;
  let actions: Record<string, unknown>[];
  let routes: RouteOptions[];

  const tokens = {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresIn: 3600,
    refreshExpiresIn: 7200
  };

  /** Creates the server of the auth routes, recording the bot checks and the options of every route. */
  const createServer = async (): Promise<Server> => {
    actions = [];
    routes = [];
    const created = Fastify({
      logger: false,
      ...requestValidation()
    }) as unknown as Server;
    created.setErrorHandler(errorHandler);
    created.addHook('onRoute', (route) => {
      routes.push(route);
    });
    created.decorate('authenticate', () => async () => undefined);
    created.decorate('currentUser', () => ({ id: 1 }) as any);
    created.decorate('recaptcha', async (request: any) => {
      actions.push({ recaptcha: request.routeOptions.config.recaptchaAction });
    });
    created.decorate('turnstile', async (request: any) => {
      actions.push({ turnstile: request.routeOptions.config.turnstileAction });
    });
    created.register(schemas);
    created.register(authRoutes);
    registerExchangeTokenRoute(created);
    await created.ready();
    return created;
  };

  const post = (url: string, payload: object = {}) =>
    server.inject({
      method: 'POST',
      url,
      headers: { 'x-recaptcha-token': 'token', 'x-turnstile-token': 'token' },
      payload
    });

  const login = () => post('/login', { username: 'a@b.c', password: 'secret' });

  beforeEach(() => {
    // The schema models of the routes stay defined, so the context is not reset
    define(new InMemory(), Memory, 'override');
    define(
      {
        login: jest.fn().mockResolvedValue(tokens),
        generateAuthTokens: jest.fn().mockResolvedValue(tokens),
        changePassword: jest.fn().mockResolvedValue(tokens)
      } as any,
      AuthService,
      'override'
    );
  });

  afterEach(async () => {
    await server?.close();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('authRouteCaptcha', () => {
    test('requires the enabled bot checks listing the route, for its action', () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      configOverrides.SECURITY_RECAPTCHA_AUTH_ROUTES = ['changePassword'];
      configOverrides.SECURITY_TURNSTILE_AUTH_ROUTES = ['changePassword'];

      expect(authRouteCaptcha(CaptchaAuthRoute.ChangePassword)).toEqual({
        recaptchaAction: 'change-password'
      });
      expect(authRouteCaptcha(CaptchaAuthRoute.Login)).toEqual({});
    });
  });

  describe('authRoutes', () => {
    test('requires no bot check by default', async () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;
      server = await createServer();

      await login();
      await post('/refresh');
      await post('/change-password', {
        currentPassword: 'old',
        newPassword: 'N3w!Password'
      });

      expect(actions).toEqual([]);
    });

    test('verifies the bot checks of the opted in routes, for their actions', async () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      configOverrides.SECURITY_RECAPTCHA_AUTH_ROUTES = [
        'login',
        'refresh',
        'changePassword'
      ];
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;
      configOverrides.SECURITY_TURNSTILE_AUTH_ROUTES = ['login'];
      server = await createServer();

      expect((await login()).statusCode).toBe(200);
      await post('/refresh');
      await post('/change-password', {
        currentPassword: 'old',
        newPassword: 'N3w!Password'
      });

      expect(actions).toEqual([
        { recaptcha: 'login' },
        { turnstile: 'login' },
        { recaptcha: 'refresh' },
        { recaptcha: 'change-password' }
      ]);
    });

    test('documents the header and the errors of a required bot check', async () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      configOverrides.SECURITY_RECAPTCHA_AUTH_ROUTES = ['login'];
      server = await createServer();
      const schemaOf = (url: string) =>
        routes.find((route) => route.url === url)!.schema as any;

      expect(schemaOf('/login').headers.required).toEqual([
        'x-recaptcha-token'
      ]);
      expect(JSON.stringify(schemaOf('/login').response)).toContain(
        ErrorCode.RecaptchaMissing
      );
      expect(schemaOf('/refresh').headers.properties).toEqual({});

      const response = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { username: 'a@b.c', password: 'secret' }
      });
      expect(response.statusCode).toBe(400);
    });

    test('counts the logins with the other password sign-ins', async () => {
      server = await createServer();

      for (let i = 0; i < 12; i++) {
        expect((await login()).statusCode).toBe(200);
      }
      const limited = await login();

      expect(limited.statusCode).toBe(429);
      expect(limited.json().code).toBe(ErrorCode.RateLimited);
    });

    test('fails the password routes while the rate limiter fails', async () => {
      server = await createServer();
      const limitOf = (url: string) =>
        (routes.find((route) => route.url === url)!.config as any).rateLimit;

      expect(limitOf('/change-password')).toMatchObject({ secure: true });
      expect(limitOf('/auth/exchange-token')).toMatchObject({ secure: true });
    });
  });
});
