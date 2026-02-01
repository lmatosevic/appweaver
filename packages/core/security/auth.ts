import { FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyAuth from '@fastify/auth';
import fastifyJwt from '@fastify/jwt';
import {
  fastifyRequestContext,
  requestContext
} from '@fastify/request-context';
import { config, HttpError } from '@appweaver/common';
import { authService } from './auth-service';
import { authRoutes } from './auth-routes';
import { currentIdentity, hasRoles } from './helper';
import { JwtPayload, ServerInstance } from '../types';

export default fastifyPlugin(async (server: ServerInstance): Promise<void> => {
  server.register(fastifyAuth);

  if (!config.SECURITY_JWT_SECRET) {
    throw new Error('JWT_SECRET variable is not set in production environment');
  }

  server.register(fastifyJwt, {
    secret: config.SECURITY_JWT_SECRET
  });

  server.register(fastifyRequestContext, {
    defaultStoreValues: {
      identity: null
    }
  });

  server.register(authRoutes, { prefix: config.SECURITY_ROUTE_PREFIX });

  server.decorate(
    'authenticateJWT',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload: JwtPayload = await request.jwtVerify();
        const identity = await authService.findById(payload.sub);

        const refreshPath = '/auth/refresh';

        if (
          !identity ||
          !identity.enabled ||
          (identity.logoutAt &&
            new Date(identity.logoutAt).getTime() > payload.iat) ||
          (payload.refresh && request.url !== refreshPath) ||
          (!payload.refresh && request.url === refreshPath)
        ) {
          reply
            .code(401)
            .send({ message: 'Unauthorized access', errorCode: 401 });
          return;
        }

        const { roles } = request.routeOptions.config;
        if (roles && !hasRoles(identity, roles)) {
          reply.code(403).send({ message: 'Forbidden access', errorCode: 403 });
          return;
        }

        requestContext.set('identity', identity);
      } catch (e) {
        throw new HttpError('Authentication error', 401, e);
      }
    }
  );

  server.decorate('currentIdentity', () => {
    const identity = currentIdentity();

    if (!identity) {
      throw new HttpError('Unauthorized', 401);
    }

    return identity;
  });
});
