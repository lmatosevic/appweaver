import { AuthSource, AuthType, AuthUser, RouteConfig } from '@appweaver/common';
import { ApiKey } from './generated';

import '@fastify/request-context';
import '@fastify/auth';

declare module 'fastify' {
  // Override fastify context data type.
  interface FastifyContextConfig extends RouteConfig {}

  // Extend the fastify with jwt decorator type.
  interface FastifyInstance {
    recaptcha: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateJWT: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    authenticateApiKey: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    authenticate: (authTypes?: AuthType[]) => any;
    currentUser: () => AuthUser;
  }
}

declare module '@fastify/request-context' {
  // Override request context data type.
  interface RequestContextData {
    authUser: AuthUser | null;
    authType: AuthType | null;
    authSource: AuthSource | null;
    apiKey: ApiKey | null;
    cached?: boolean;
  }
}
