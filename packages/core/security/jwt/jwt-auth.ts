import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { requestContext } from '@fastify/request-context';
import {
  AuthType,
  AuthUser,
  config,
  ErrorCode,
  isAppweaverError,
  logger,
  ModuleErrorCode
} from '@appweaver/common';
import { inject } from '../../context';
import { AuthService } from '../auth-service';
import { AuthError } from '../auth-error';
import { JwtPayload, Server } from '../../types';
import { loadSecurityKeys } from './jwt-keys';

export const jwtAuth = fastifyPlugin(async (server: Server) => {
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

  server.decorate('authenticateJWT', async (request: FastifyRequest) => {
    let payload: JwtPayload;
    let authUser: AuthUser | null;

    try {
      payload = await request.jwtVerify();
      authUser = await authService.findById(payload.sub);
    } catch (e) {
      if (isAppweaverError(e)) {
        throw e;
      }
      throw new AuthError(
        jwtErrorCode((e as { code?: string }).code),
        'Authentication error',
        {},
        { cause: e }
      );
    }

    authService.authorize(
      authUser,
      request.url,
      request.routeOptions.config,
      payload
    );

    requestContext.set('authUser', authUser);
    requestContext.set('authType', AuthType.Jwt);
    requestContext.set('authSource', payload.source);
  });
});

function jwtErrorCode(code?: string): ModuleErrorCode<'AUTH'> {
  switch (code) {
    case 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED':
      return ErrorCode.AuthTokenExpired;
    case 'FST_JWT_NO_AUTHORIZATION_IN_HEADER':
      return ErrorCode.AuthUnauthorized;
    default:
      return ErrorCode.AuthInvalidToken;
  }
}

export function hasBearerAuth(request: FastifyRequest): boolean {
  return (
    request.headers.authorization?.toLowerCase().startsWith('bearer') === true
  );
}
