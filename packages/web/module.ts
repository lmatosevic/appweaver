import { Database, defineModule } from '@appweaver/common';
import { healthCheckConfig } from './health/health-check-config';
import {
  accountConfig,
  basicAuthConfig,
  jwtConfig,
  oauth2Config,
  recaptchaConfig,
  securityConfig,
  turnstileConfig,
  twoFactorConfig
} from './security/security-config';
import {
  corsConfig,
  rateLimitConfig,
  serverConfig,
  swaggerConfig
} from './server/server-config';
import { templatePreviewConfig } from './template/template-preview-config';

/** The HTTP server with the authentication. */
export default defineModule({
  name: '@appweaver/web',
  requires: ['@appweaver/data'],
  config: [
    serverConfig,
    rateLimitConfig,
    swaggerConfig,
    corsConfig,
    healthCheckConfig,
    securityConfig,
    accountConfig,
    twoFactorConfig,
    recaptchaConfig,
    turnstileConfig,
    basicAuthConfig,
    jwtConfig,
    oauth2Config,
    templatePreviewConfig
  ],
  services: [
    { load: () => import('./security/auth-service'), requires: [Database] },
    {
      load: () => import('./security/account/account-service'),
      requires: [Database]
    },
    {
      load: () => import('./security/oauth2/oauth2-service'),
      requires: [Database]
    },
    // Defined last, so its server is created once every other service is
    { load: () => import('./server/http-server') }
  ],
  setup: async (context) =>
    (await import('./resource/route-loader')).loadWebParts(context),
  web: () => import('./web-resources')
});
