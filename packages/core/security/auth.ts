import fastifyPlugin from 'fastify-plugin';
import fastifyAuth from '@fastify/auth';
import { AuthType, config } from '@appweaver/common';
import { HttpError } from '../errors';
import { Server } from '../types';
import { currentAuthUser } from './helper';
import { authRoutes } from './auth-routes';
import { basicAuth } from './basic';
import { jwtAuth } from './jwt';
import * as oauth2Plugins from './oauth2';

export default fastifyPlugin((server: Server): void => {
  server.register(fastifyAuth);

  server.register(basicAuth);

  server.register(jwtAuth);

  for (const oauth2Plugin of Object.values(oauth2Plugins)) {
    server.register(oauth2Plugin);
  }

  server.register(authRoutes, { prefix: config.SECURITY_ROUTE_PREFIX });

  server.decorate('authenticate', (...authTypes: AuthType[]) => {
    const { auth, authenticateJWT, basicAuth } = server;

    const auths: any[] = [];

    for (const authType of authTypes) {
      switch (authType) {
        case AuthType.Basic:
          if (config.SECURITY_BASIC_ENABLED) {
            auths.push(basicAuth);
          }
          break;
        case AuthType.JWT:
          auths.push(authenticateJWT);
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
