import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyBasicAuth from '@fastify/basic-auth';
import { requestContext } from '@fastify/request-context';
import { AuthSource, AuthType, AuthUser, config } from '@appweaver/common';
import { inject } from '../../context';
import { HttpError } from '../../errors';
import { AuthService } from '../auth-service';
import { Server } from '../../types';

export const basicAuth = fastifyPlugin(async (server: Server) => {
  const authService = inject(AuthService);

  server.register(fastifyBasicAuth, {
    authenticate: config.SECURITY_BASIC_REALM
      ? { realm: config.SECURITY_BASIC_REALM }
      : true,
    proxyMode: config.SECURITY_BASIC_PROXY_MODE,
    validate: async (
      username: string,
      password: string,
      request: FastifyRequest
    ) => {
      let authUser: AuthUser;
      try {
        authUser = await authService.authenticate(username, password);
      } catch (e) {
        // The plugin sends its challenge header only with this status, which a
        // Basic auth client expects for bad credentials
        throw new HttpError(
          (e as Error).message,
          config.SECURITY_BASIC_PROXY_MODE ? 407 : 401
        );
      }

      authService.authorize(authUser, request.url, request.routeOptions.config);

      requestContext.set('authUser', authUser);
      requestContext.set('authType', AuthType.Basic);
      requestContext.set('authSource', AuthSource.Password);
    }
  });
});

export function hasBasicAuth(request: FastifyRequest): boolean {
  return (
    request.headers.authorization?.toLowerCase().startsWith('basic') === true
  );
}
