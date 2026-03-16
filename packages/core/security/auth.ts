import fastifyPlugin from 'fastify-plugin';
import fastifyAuth from '@fastify/auth';
import { AuthType, config } from '@appweaver/common';
import { HttpError } from '../errors';
import { Server } from '../types';
import { currentAuthUser } from './helper';
import { authRoutes } from './auth-routes';
import { recaptcha } from './recaptcha';
import { basicAuth } from './basic';
import { apiKeyAuth } from './api-key';
import { jwtAuth } from './jwt';
import * as oauth2Plugins from './oauth2';

export default fastifyPlugin((server: Server): void => {
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

  for (const oauth2Plugin of Object.values(oauth2Plugins)) {
    server.register(oauth2Plugin);
  }

  server.register(authRoutes, { prefix: config.SECURITY_ROUTE_PREFIX });

  server.decorate('authenticate', (...authTypes: AuthType[]) => {
    const { auth, authenticateJWT, authenticateApiKey, basicAuth } = server;

    const auths: any[] = [];

    for (const authType of authTypes) {
      switch (authType) {
        case AuthType.Jwt:
          auths.push(authenticateJWT);
          break;
        case AuthType.ApiKey:
          if (config.SECURITY_API_KEY_ENABLED) {
            auths.push(authenticateApiKey);
          }
          break;
        case AuthType.Basic:
          if (config.SECURITY_BASIC_ENABLED) {
            auths.push(basicAuth);
          }
          break;
      }
    }

    return auth(auths, { relation: 'or' });
  });

  server.decorate('currentUser', () => {
    const authUser = currentAuthUser();

    if (!authUser) {
      throw new HttpError('Unauthorized', 401);
    }

    return authUser;
  });
});
