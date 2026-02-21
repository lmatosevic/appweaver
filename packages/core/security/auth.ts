import { FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyAuth from '@fastify/auth';
import fastifyJwt from '@fastify/jwt';
import {
  fastifyRequestContext,
  requestContext
} from '@fastify/request-context';
import { config } from '@appweaver/common';
import { authService } from './auth-service';
import { authRoutes } from './auth-routes';
import { currentAuthUser, hasPermissions, hasRoles } from './helper';
import { HttpError } from '../errors';
import { JwtPayload, Server } from '../types';

export default fastifyPlugin((server: Server): void => {
  server.register(fastifyAuth);

  if (!config.SECURITY_JWT_SECRET) {
    throw new Error('JWT_SECRET variable is not set in production environment');
  }

  server.register(fastifyJwt, {
    secret: config.SECURITY_JWT_SECRET
  });

  server.register(fastifyRequestContext, {
    defaultStoreValues: {
      authUser: null
    }
  });

  server.register(authRoutes, { prefix: config.SECURITY_ROUTE_PREFIX });

  server.decorate(
    'authenticateJWT',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload: JwtPayload = await request.jwtVerify();
        const authUser = await authService.findById(payload.sub);

        const refreshPath = '/auth/refresh';

        if (
          !authUser ||
          !authUser.enabled ||
          (authUser.logoutAt &&
            new Date(authUser.logoutAt).getTime() > payload.iat) ||
          (payload.refresh && request.url !== refreshPath) ||
          (!payload.refresh && request.url === refreshPath)
        ) {
          reply
            .code(401)
            .send({ message: 'Unauthorized access', errorCode: 401 });
          return;
        }

        const { roles, permissions } = request.routeOptions.config;
        if (
          !hasRoles(authUser, roles) ||
          !hasPermissions(authUser, permissions)
        ) {
          reply.code(403).send({ message: 'Forbidden access', errorCode: 403 });
          return;
        }

        requestContext.set('authUser', authUser);
      } catch (e) {
        throw new HttpError('Authentication error', 401, e);
      }
    }
  );

  server.decorate('currentUser', () => {
    const authUser = currentAuthUser();

    if (!authUser) {
      throw new HttpError('Unauthorized', 401);
    }

    return authUser;
  });
});
