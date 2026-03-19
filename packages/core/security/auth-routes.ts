import {
  changePasswordSchema,
  createCurrentAuthUserSchema,
  exchangeTokenSchema,
  loginSchema,
  logoutSchema,
  refreshSchema
} from './auth-schema';
import { AuthType } from '@appweaver/common';
import { AuthService } from './auth-service';
import { resourceAuthModel } from './helper';
import { inject } from '../context';
import { Server } from '../types';

export function authRoutes(server: Server): void {
  const { authenticate, currentUser } = server;

  const authService = inject(AuthService);

  server.post(
    '/login',
    {
      schema: loginSchema,
      config: {
        rateLimit: {
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

      const authResponse = await authService.generateAuthTokens(authUser);

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
    '/change-password',
    {
      schema: changePasswordSchema,
      onRequest: authenticate(),
      config: {
        rateLimit: {
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

  server.post(
    '/exchange-token',
    {
      schema: exchangeTokenSchema,
      config: {
        rateLimit: {
          max: 12
        }
      }
    },
    async (request, reply) => {
      const { token } = request.body;

      const authResponse = await authService.exchangeToken(token);

      return reply.send(authResponse);
    }
  );

  const authUserModel = resourceAuthModel();
  if (authUserModel) {
    server.get(
      '/me',
      {
        schema: createCurrentAuthUserSchema(authUserModel.name),
        onRequest: authenticate()
      },
      async (_, reply) => {
        const authUser = currentUser();

        return reply.send(authUser);
      }
    );
  }
}
