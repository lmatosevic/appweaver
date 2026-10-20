import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import {
  AuthType,
  AuthUser,
  ErrorCode,
  isAppweaverError,
  logger,
  ModuleErrorCode,
  AuthError
} from '@appweaver/common';
import { jwtConfig } from '../security-config';
import { inject } from '../../context';
import { AuthService } from '../auth-service';
import { JwtPayload, Server } from '../../types';
import { loadSecurityKeys } from './jwt-keys';
import { setAuthContext } from '../../context/auth-context';

export const jwtAuth = fastifyPlugin(async (server: Server) => {
  const authService = inject(AuthService);

  if (jwtConfig.SECRET) {
    server.register(fastifyJwt, {
      secret: jwtConfig.SECRET
    });
  } else {
    const { keysExisted, publicKey, privateKey } = await loadSecurityKeys(
      jwtConfig.PUBLIC_KEY_PATH,
      jwtConfig.PRIVATE_KEY_PATH,
      jwtConfig.AUTO_GENERATE_KEYS
    );

    if (!keysExisted) {
      logger.info(
        {
          publicKeyPath: jwtConfig.PUBLIC_KEY_PATH,
          privateKeyPath: jwtConfig.PRIVATE_KEY_PATH
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

    setAuthContext({
      authUser,
      authType: AuthType.Jwt,
      authSource: payload.source
    });
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

/** Checks whether a request carries a bearer token in its `Authorization` header. */
export function hasBearerAuth(request: FastifyRequest): boolean {
  return (
    request.headers.authorization?.toLowerCase().startsWith('bearer') === true
  );
}
