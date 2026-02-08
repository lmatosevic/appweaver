import { RouteConfig } from './route-config';
import { Identity } from './generated';

import '@fastify/request-context';
import '@fastify/auth';

declare module 'fastify' {
  // Override fastify context data type.
  interface FastifyContextConfig extends RouteConfig {}

  // Extend the fastify with jwt decorator type.
  interface FastifyInstance {
    authenticateJWT: any;
    currentIdentity: () => Identity;
  }
}

declare module '@fastify/request-context' {
  // Override request context data type.
  interface RequestContextData {
    identity: Identity | null;
  }
}
