import fastify from 'fastify';
import { fastifyRequestContext } from '@fastify/request-context';
import { AuthUser } from '@appweaver/common';
import { errorHandler } from '../../errors';
import {
  currentAuthSource,
  currentAuthType,
  currentAuthUser
} from '../../security/helper';
import { Server } from '../../types';

/**
 * Creates a bare fastify instance with the request context and error handling of `createServer`, so the security
 * plugins under test read and write the authenticated user the way they do in the application.
 */
export function createTestServer(): Server {
  const server = fastify() as unknown as Server;

  server.register(fastifyRequestContext, {
    defaultStoreValues: {
      authUser: null,
      authType: null,
      authSource: null,
      apiKey: null
    }
  });
  server.setErrorHandler(errorHandler);

  return server;
}

/** Adds a `GET /me` route answering with the user, type, and source the given hook authenticated, or `null`. */
export function addMeRoute(
  server: Server,
  onRequest: (server: Server) => any,
  config: Record<string, unknown> = {}
): void {
  server.after(() => {
    server.get('/me', {
      config,
      onRequest: onRequest(server),
      handler: async () => ({
        user: currentAuthUser() ?? null,
        type: currentAuthType() ?? null,
        source: currentAuthSource() ?? null
      })
    });
  });
}

/** Builds an authenticated user with no roles. */
export function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    email: 'user@test.com',
    enabled: true,
    roles: [],
    twoFactorAuth: 'None',
    ...overrides
  };
}
