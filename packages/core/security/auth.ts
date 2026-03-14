import fastifyPlugin from 'fastify-plugin';
import fastifyAuth from '@fastify/auth';
import { config } from '@appweaver/common';
import { HttpError } from '../errors';
import { Server } from '../types';
import { currentAuthUser } from './helper';
import { authRoutes } from './auth-routes';
import { jwtAuth } from './jwt';
import * as oauth2Plugins from './oauth2';

export default fastifyPlugin((server: Server): void => {
  server.register(fastifyAuth);

  server.register(jwtAuth);

  for (const oauth2Plugin of Object.values(oauth2Plugins)) {
    server.register(oauth2Plugin);
  }

  server.register(authRoutes, { prefix: config.SECURITY_ROUTE_PREFIX });

  server.decorate('currentUser', () => {
    const authUser = currentAuthUser();

    if (!authUser) {
      throw new HttpError('Unauthorized', 401);
    }

    return authUser;
  });
});
