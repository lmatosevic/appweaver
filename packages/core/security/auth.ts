import { FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyAuth from '@fastify/auth';
import { AuthType, config } from '@appweaver/common';
import { HttpError } from '../errors';
import { Server } from '../types';
import { currentAuthUser } from './helper';
import { authRoutes } from './auth-routes';
import { accountRoutes } from './account';
import { recaptcha } from './recaptcha';
import { basicAuth, hasBasicAuth } from './basic';
import { apiKeyAuth, hasApiKey } from './api-key';
import { hasBearerAuth, jwtAuth } from './jwt';
import * as oauth2Plugins from './oauth2';

export default fastifyPlugin((server: Server) => {
  server.register(fastifyAuth);

  if (config.SECURITY_RECAPTCHA_ENABLED) {
    server.register(recaptcha);
  }

  if (config.SECURITY_BASIC_ENABLED) {
    server.register(basicAuth);
  }

  if (config.SECURITY_API_KEY_ENABLED) {
    server.register(apiKeyAuth);
  }

  server.register(jwtAuth);

  // Load and register all plugins exported from oauth2 dir, plugin enabled
  // status and required config values are checked at plugin initialization
  for (const oauth2Plugin of Object.values(oauth2Plugins)) {
    server.register(oauth2Plugin);
  }

  server.register(authRoutes, { prefix: config.SECURITY_ROUTE_PREFIX });

  server.register(accountRoutes, {
    prefix: config.SECURITY_ACCOUNT_ROUTE_PREFIX
  });

  server.decorate('authenticate', (authTypes?: AuthType[]) => {
    const { auth, authenticateJWT, authenticateApiKey, basicAuth } = server;

    const authHandlers: any[] = [];

    const optionalHandler =
      (
        hasAuthCredentials: (req: FastifyRequest) => boolean,
        handler: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
      ) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        if (hasAuthCredentials(req)) {
          await handler(req, reply);
        }
      };

    // Register enabled authentication handlers. Each handler executes only when
    // the request contains credentials matching its authentication flow; otherwise,
    // it is skipped. At least one handler must succeed for the request to be
    // authenticated; if all handlers are skipped, a 401 error is returned
    for (const authType of authTypes ?? Object.values(AuthType)) {
      switch (authType) {
        case AuthType.Jwt:
          authHandlers.push(optionalHandler(hasBearerAuth, authenticateJWT));
          break;
        case AuthType.ApiKey:
          if (config.SECURITY_API_KEY_ENABLED) {
            authHandlers.push(optionalHandler(hasApiKey, authenticateApiKey));
          }
          break;
        case AuthType.Basic:
          if (config.SECURITY_BASIC_ENABLED) {
            authHandlers.push([
              // Use OR condition since Basic auth plugin throws an error before
              // the validation function is called. Also, the Basic auth plugin
              // is using a callback-based handler
              async (req: FastifyRequest) => {
                if (hasBasicAuth(req)) {
                  throw new HttpError('Invalid authorization header', 401);
                }
              },
              basicAuth
            ]);
          }
          break;
      }
    }

    // If a user has not been authenticated using any of the provided methods,
    // then throw 401 error
    authHandlers.push(async () => {
      if (!currentAuthUser()) {
        throw new HttpError('Unauthorized', 401);
      }
    });

    return auth(authHandlers, { relation: 'and' });
  });

  server.decorate('currentUser', () => {
    const authUser = currentAuthUser();

    if (!authUser) {
      throw new HttpError('Unauthorized', 401);
    }

    return authUser;
  });
});
