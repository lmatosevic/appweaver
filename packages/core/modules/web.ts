import { Database, defineModule } from '@appweaver/common';

/** The HTTP server with the authentication. */
export default defineModule({
  name: '@appweaver/web',
  services: [
    { load: () => import('../security/auth-service'), requires: [Database] },
    {
      load: () => import('../security/account/account-service'),
      requires: [Database]
    },
    {
      load: () => import('../security/oauth2/oauth2-service'),
      requires: [Database]
    },
    // Defined last, so its server is created once every other service is
    { load: () => import('../server/http-server') }
  ]
});
