import { RouteConfig } from '@appweaver/common';
import { AuthUser } from './auth';

import '@fastify/request-context';
import '@fastify/auth';

declare module 'fastify' {
  // Override fastify context data type.
  interface FastifyContextConfig extends RouteConfig {}

  // Extend the fastify with jwt decorator type.
  interface FastifyInstance {
    authenticateJWT: any;
    caching: any;
    currentUser: () => AuthUser;
  }
}

declare module '@fastify/request-context' {
  // Override request context data type.
  interface RequestContextData {
    authUser: AuthUser | null;
  }
}
