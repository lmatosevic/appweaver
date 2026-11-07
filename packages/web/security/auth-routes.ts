import {
  changePasswordSchema,
  createCurrentAuthUserSchema,
  exchangeTokenSchema,
  loginSchema,
  logoutSchema,
  refreshSchema
} from './auth-schema';
import { AuthScope, AuthSource, AuthType } from '@appweaver/common';
import { AuthService } from './auth-service';
import { resourceAuthModel } from '@appweaver/data';
import { inject, currentAuthSource } from '@appweaver/core';
import { Server } from '../types/server';
import { securityConfig } from './security-config';

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

  server.post(
    '/login',
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          secure: true,
          max: 12
        }
      }
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

  server.post(
    '/refresh',
    {
      schema: refreshSchema,
      onRequest: authenticate([AuthType.Jwt]),
      config: {
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

  server.post(
    '/change-password',
    {
      schema: changePasswordSchema,
      onRequest: authenticate(),
      config: {
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
