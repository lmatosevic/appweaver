import { FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { requestContext } from '@fastify/request-context';
import { config, logger } from '@appweaver/common';
import { AuthService } from '../auth-service';
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

        const result = authService.authorize(
          authUser,
          request.url,
          request.routeOptions.config,
          payload
        );

        if (!result.success) {
          return reply
            .code(result.errorCode)
            .send({ message: result.message, errorCode: result.errorCode });
        }

        requestContext.set('authUser', authUser);
      } catch (e) {
        throw new HttpError('Authentication error', 401, e);
      }
    }
  );
});
