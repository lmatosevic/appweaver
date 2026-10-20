import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyBasicAuth from '@fastify/basic-auth';
import {
  AuthSource,
  AuthType,
  AuthUser,
  ErrorCode,
  isAppweaverError,
  AuthError
} from '@appweaver/common';
import { basicAuthConfig } from '../security-config';
import { inject, setAuthContext } from '@appweaver/core';
import { AuthService } from '../auth-service';
import { Server } from '../../types/server';

export const basicAuth = fastifyPlugin(async (server: Server) => {
  const authService = inject(AuthService);

  server.register(fastifyBasicAuth, {
    authenticate: basicAuthConfig.REALM
      ? { realm: basicAuthConfig.REALM }
      : true,
    proxyMode: basicAuthConfig.PROXY_MODE,
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
          basicAuthConfig.PROXY_MODE
            ? ErrorCode.AuthProxyAuthenticationRequired
            : ErrorCode.AuthInvalidCredentials,
          (e as Error).message
        );
      }

      authService.authorize(authUser, request.url, request.routeOptions.config);

      setAuthContext({
        authUser,
        authType: AuthType.Basic,
        authSource: AuthSource.Password
      });
    }
  });
});

/** Checks whether a request carries basic credentials in its `Authorization` header. */
export function hasBasicAuth(request: FastifyRequest): boolean {
  return (
    request.headers.authorization?.toLowerCase().startsWith('basic') === true
  );
}
