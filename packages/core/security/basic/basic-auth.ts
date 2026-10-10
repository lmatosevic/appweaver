import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyBasicAuth from '@fastify/basic-auth';
import { requestContext } from '@fastify/request-context';
import {
  AuthSource,
  AuthType,
  AuthUser,
  config,
  ErrorCode,
  isAppweaverError
} from '@appweaver/common';
import { inject } from '../../context';
import { AuthError } from '../auth-error';
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
        // Any other error, i.e. an unavailable database, keeps its own status
        if (!isAppweaverError(e) || e.module !== 'auth') {
          throw e;
        }
        // The plugin sends its challenge header, which a Basic auth client
        // expects for bad credentials, only with the status these codes map to
        throw new AuthError(
          config.SECURITY_BASIC_PROXY_MODE
            ? ErrorCode.AuthProxyAuthenticationRequired
            : ErrorCode.AuthInvalidCredentials,
          (e as Error).message
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
