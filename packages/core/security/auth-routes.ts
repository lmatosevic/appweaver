import { authService } from './auth-service';
import {
  changePasswordSchema,
  currentIdentitySchema,
  loginSchema,
  logoutSchema,
  refreshSchema
} from '../schema';
import { ServerInstance } from '../types';

export function authRoutes(server: ServerInstance): void {
  const { auth, currentIdentity, authenticateJWT } = server;

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
      const identity = currentIdentity();

      const authResponse = await authService.generateAuthTokens(identity);

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
      const identity = currentIdentity();

      const success = await authService.logout(identity.id);

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
      const identity = currentIdentity();

      const authResponse = await authService.changePassword(
        identity,
        request.body.currentPassword,
        request.body.newPassword
      );

      reply.status(200).send(authResponse);
    }
  );

  server.get(
    '/identity',
    {
      schema: currentIdentitySchema,
      onRequest: auth([authenticateJWT])
    },
    async (_, reply) => {
      const identity = currentIdentity();

      reply.status(200).send(identity);
    }
  );
}
