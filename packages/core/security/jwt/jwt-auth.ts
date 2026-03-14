import { FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { requestContext } from '@fastify/request-context';
import { config, logger } from '@appweaver/common';
import { AuthService } from '../auth-service';
import { hasPermissions, hasRoles } from '../helper';
import { inject } from '../../context';
import { HttpError } from '../../errors';
import { JwtPayload, Server } from '../../types';
import { loadSecurityKeys } from './jwt-keys';

export const jwtAuth = fastifyPlugin(async (server: Server): Promise<void> => {
  const authService = inject(AuthService);

  if (config.SECURITY_JWT_SECRET) {
    server.register(fastifyJwt, {
      secret: config.SECURITY_JWT_SECRET
    });
  } else {
    const { keysExisted, publicKey, privateKey } = await loadSecurityKeys(
      config.SECURITY_JWT_PUBLIC_KEY_PATH,
      config.SECURITY_JWT_PRIVATE_KEY_PATH,
      config.SECURITY_JWT_AUTO_GENERATE_KEYS
    );

    if (!keysExisted) {
      logger.info(
        {
          publicKeyPath: config.SECURITY_JWT_PUBLIC_KEY_PATH,
          privateKeyPath: config.SECURITY_JWT_PRIVATE_KEY_PATH
        },
        'Security keys generated'
      );
    }

    server.register(fastifyJwt, {
      secret: {
        public: publicKey,
        private: privateKey
      },
      sign: { algorithm: 'RS256' }
    });
  }

  server.decorate(
    'authenticateJWT',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload: JwtPayload = await request.jwtVerify();
        const authUser = await authService.findById(payload.sub);

        const refreshPath = `/${config.SECURITY_ROUTE_PREFIX}/refresh`;

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
});
