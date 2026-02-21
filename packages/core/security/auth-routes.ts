import { authService } from './auth-service';
import {
  changePasswordSchema,
  createCurrentAuthUserSchema,
  loginSchema,
  logoutSchema,
  refreshSchema
} from './auth-schema';
import { authModel } from './helper';
import { Server } from '../types';

export function authRoutes(server: Server): void {
  const { auth, currentUser, authenticateJWT } = server;

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

      reply.status(200).send(authResponse);
    }
  );

  server.post(
    '/refresh',
    {
      schema: refreshSchema,
      onRequest: auth([authenticateJWT]),
      config: {
        rateLimit: {
          max: 12
        }
      }
    },
    async (_, reply) => {
      const authUser = currentUser();

      const authResponse = await authService.generateAuthTokens(authUser);

      reply.status(200).send(authResponse);
    }
  );

  server.post(
    '/logout',
    {
      schema: logoutSchema,
      onRequest: auth([authenticateJWT])
    },
    async (_, reply) => {
      const authUser = currentUser();

      const success = await authService.logout(authUser.id);

      reply.status(200).send({ success });
    }
  );

  server.post(
    '/change-password',
    {
      schema: changePasswordSchema,
      onRequest: auth([authenticateJWT]),
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

      reply.status(200).send(authResponse);
    }
  );

  const authUserModel = authModel();
  if (authUserModel) {
    server.get(
      '/me',
      {
        schema: createCurrentAuthUserSchema(authUserModel.name),
        onRequest: auth([authenticateJWT])
      },
      async (_, reply) => {
        const authUser = currentUser();

        reply.status(200).send(authUser);
      }
    );
  }
}
