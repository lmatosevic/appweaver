import { FastifyRequest } from 'fastify';
import {
  captchaErrorCodes,
  captchaHeaderSchema,
  changePasswordSchema,
  createCurrentAuthUserSchema,
  exchangeTokenSchema,
  loginSchema,
  logoutSchema,
  refreshSchema
} from './auth-schema';
import {
  AuthScope,
  AuthSource,
  AuthType,
  CaptchaConfig
} from '@appweaver/common';
import { AuthService } from './auth-service';
import { resourceAuthModel } from '@appweaver/data';
import { inject, currentAuthSource } from '@appweaver/core';
import { errorResponses } from '../errors';
import { Server } from '../types/server';
import { checkLoginRateLimit } from './login-rate-limit';
import {
  CaptchaAuthRoute,
  recaptchaConfig,
  securityConfig,
  turnstileConfig
} from './security-config';

/** The action of the bot checks of each authentication route. */
const CAPTCHA_ACTIONS: Record<CaptchaAuthRoute, string> = {
  [CaptchaAuthRoute.Login]: 'login',
  [CaptchaAuthRoute.Refresh]: 'refresh',
  [CaptchaAuthRoute.ChangePassword]: 'change-password'
};

/**
 * Returns the bot checks an authentication route requires: the reCAPTCHA and the Turnstile enabled with the route in
 * their `authRoutes`, each for the action of the route.
 *
 * @param {CaptchaAuthRoute} route - The authentication route.
 * @return {CaptchaConfig} The bot checks of the route, empty when it requires none.
 */
export function authRouteCaptcha(route: CaptchaAuthRoute): CaptchaConfig {
  const action = CAPTCHA_ACTIONS[route];
  return {
    ...(recaptchaConfig.ENABLED && recaptchaConfig.AUTH_ROUTES.includes(route)
      ? { recaptchaAction: action }
      : {}),
    ...(turnstileConfig.ENABLED && turnstileConfig.AUTH_ROUTES.includes(route)
      ? { turnstileAction: action }
      : {})
  };
}

/**
 * Registers the route exchanging a one-time token for the tokens of the `auth` scope, once, by whichever of the
 * features issuing its tokens registers it first: an enabled OAuth2 provider, or the two-factor authentication. Without
 * them no token could be exchanged, so the route is left out.
 *
 * @param {Server} server - The root server, the route registered under the `security.routePrefix`.
 */
export function registerExchangeTokenRoute(server: Server): void {
  const url = `${securityConfig.ROUTE_PREFIX.replace(/\/$/, '')}/exchange-token`;
  if (server.hasRoute({ method: 'POST', url })) {
    return;
  }

  const authService = inject(AuthService);

  server.post(
    url,
    {
      schema: exchangeTokenSchema,
      config: {
        rateLimit: {
          secure: true,
          max: 12
        }
      }
    },
    async (request, reply) => {
      const { token, password } = request.body;

      const authResponse = await authService.exchangeToken(token, password);

      return reply.send(authResponse);
    }
  );
}

/**
 * Registers the authentication routes: login, logout, token refresh, password change, and the current identity.
 *
 * @param {Server} server - The server to register the routes on.
 */
export function authRoutes(server: Server): void {
  const { authenticate, currentUser } = server;

  const authService = inject(AuthService);

  /** The schema, the config and the bot check hooks of a route, with the bot checks it requires. */
  const withCaptcha = <S extends { response: Record<number, unknown> }>(
    route: CaptchaAuthRoute,
    schema: S
  ) => {
    const captcha = authRouteCaptcha(route);
    return {
      schema: {
        ...schema,
        headers: captchaHeaderSchema(captcha),
        response: {
          ...schema.response,
          ...errorResponses(...captchaErrorCodes(captcha))
        }
      },
      captcha,
      hooks: [
        captcha.recaptchaAction ? server.recaptcha : undefined,
        captcha.turnstileAction ? server.turnstile : undefined
      ].filter((hook) => hook !== undefined)
    };
  };

  const login = withCaptcha(CaptchaAuthRoute.Login, loginSchema);

  server.post(
    '/login',
    {
      schema: login.schema,
      // Counted with the other password sign-ins, before the bot checks
      onRequest: [
        (request: FastifyRequest) => checkLoginRateLimit(request),
        ...login.hooks
      ],
      config: login.captcha
    },
    async (request, reply) => {
      const { username, password } = request.body;

      const authResponse = await authService.login(username, password);

      return reply.send(authResponse);
    }
  );

  server.post(
    '/logout',
    {
      schema: logoutSchema,
      onRequest: authenticate([AuthType.Jwt])
    },
    async (_, reply) => {
      const authUser = currentUser();

      const success = await authService.logout(authUser.id);

      return reply.send({ success });
    }
  );

  const refresh = withCaptcha(CaptchaAuthRoute.Refresh, refreshSchema);
  server.post(
    '/refresh',
    {
      schema: refresh.schema,
      onRequest: [authenticate([AuthType.Jwt]), ...refresh.hooks],
      config: {
        ...refresh.captcha,
        rateLimit: {
          max: 12
        }
      }
    },
    async (_, reply) => {
      const authUser = currentUser();

      const authResponse = await authService.generateAuthTokens(
        authUser,
        AuthScope.Auth,
        currentAuthSource() ?? AuthSource.Password
      );

      return reply.send(authResponse);
    }
  );

  const changePassword = withCaptcha(
    CaptchaAuthRoute.ChangePassword,
    changePasswordSchema
  );
  server.post(
    '/change-password',
    {
      schema: changePassword.schema,
      onRequest: [authenticate(), ...changePassword.hooks],
      config: {
        ...changePassword.captcha,
        rateLimit: {
          secure: true,
          max: 12
        }
      }
    },
    async (request, reply) => {
      const authUser = currentUser();

      const authResponse = await authService.changePassword(
        authUser,
        request.body.currentPassword,
        request.body.newPassword
      );

      return reply.send(authResponse);
    }
  );

  const authUserModel = resourceAuthModel();
  if (authUserModel) {
    server.get(
      '/me',
      {
        schema: createCurrentAuthUserSchema(authUserModel.readOneModel),
        onRequest: authenticate()
      },
      async (_, reply) => {
        const authUser = currentUser();

        return reply.send(authUser);
      }
    );
  }
}
