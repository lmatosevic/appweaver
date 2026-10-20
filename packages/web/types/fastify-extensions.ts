import { AuthType, AuthUser, RouteConfig } from '@appweaver/common';

import '@fastify/request-context';
import '@fastify/auth';

declare module 'fastify' {
  // Override fastify context data type.
  interface FastifyContextConfig extends RouteConfig {}

  // Extend the fastify with jwt decorator type.
  interface FastifyInstance {
    recaptcha: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    turnstile: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
  // Override request context data type, the authenticated user is kept in
  // the auth context of core
  interface RequestContextData {
    cached?: boolean;
  }
}
