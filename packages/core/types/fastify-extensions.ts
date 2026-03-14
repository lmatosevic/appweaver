import { RouteConfig } from '@appweaver/common';
import { AuthUser } from './auth';
import { OAuth2Namespace } from '@fastify/oauth2';
import '@fastify/request-context';
import '@fastify/auth';

declare module 'fastify' {
  // Override fastify context data type.
  interface FastifyContextConfig extends RouteConfig {}

  // Extend the fastify with jwt decorator type.
  interface FastifyInstance {
    authenticateJWT: any;
    googleOAuth2: OAuth2Namespace;
    facebookOAuth2: OAuth2Namespace;
    currentUser: () => AuthUser;
  }
}

declare module '@fastify/request-context' {
  // Override request context data type.
  interface RequestContextData {
    authUser: AuthUser | null;
    cached?: boolean;
  }
}
