import fastifyPlugin from 'fastify-plugin';
import oauthPlugin from '@fastify/oauth2';
import { AuthType, config } from '@appweaver/common';
import { inject } from '../../context';
import { AuthService } from '../auth-service';
import {
  createOAuth2CallbackSchema,
  createOAuth2RedirectSchema
} from '../auth-schema';
import { Server } from '../../types';
import { HttpError } from '../../errors';

export const oauth2Facebook = fastifyPlugin(
  async (server: Server): Promise<void> => {
    if (!config.SECURITY_FACEBOOK_ENABLED) {
      return;
    }

    if (
      !config.SECURITY_FACEBOOK_APP_ID ||
      !config.SECURITY_FACEBOOK_APP_SECRET
    ) {
      throw Error('Facebook OAuth2 configuration is missing');
    }

    const authService = inject(AuthService);

    const prefix = config.SECURITY_ROUTE_PREFIX.replace(/\/$/, '');

    server.register(oauthPlugin, {
      name: 'facebookOAuth2',
      credentials: {
        client: {
          id: config.SECURITY_FACEBOOK_APP_ID,
          secret: config.SECURITY_FACEBOOK_APP_SECRET
        },
        auth: oauthPlugin.FACEBOOK_CONFIGURATION
      },
      scope: ['public_profile', 'email'],
      schema: createOAuth2RedirectSchema('Facebook'),
      startRedirectPath: `${prefix}/login/facebook`,
      callbackUri: `${config.APP_HOSTNAME}${prefix}/login/facebook/callback`,
      generateStateFunction: async function (request: any) {
        const returnToUrl = request.query.returnToUrl;

        return authService.generateOAuth2State({ returnToUrl });
      },
      checkStateFunction: async function (request: any) {
        const stateData = await authService.checkOAuth2State(
          request.query.state
        );

        request.returnToUrl = stateData.returnToUrl;

        return true;
      }
    });

    server.get(
      `${prefix}/login/facebook/callback`,
      {
        schema: createOAuth2CallbackSchema('Facebook')
      },
      async function (request, reply) {
        const { token } =
          await server.facebookOAuth2.getAccessTokenFromAuthorizationCodeFlow(
            request
          );

        const fbUser = await fetchFacebookUser(token.access_token);
        const [firstName, lastName] = fbUser.name.split(' ');

        let authUser = await authService.findByUsername(fbUser.email);
        if (!authUser) {
          authUser = await authService.registerAuthUser(
            AuthType.Oauth2Facebook,
            fbUser.email,
            undefined,
            { firstName, lastName }
          );
        } else if (!authUser.verifiedEmail) {
          throw new HttpError('Auth user email address is not verified', 403);
        }

        const ott = await authService.generateOneTimeToken(authUser);

        return reply.redirect(`${(request as any).returnToUrl}?token=${ott}`);
      }
    );
  }
);

async function fetchFacebookUser(
  accessToken: string
): Promise<{ id: number; name: string; email: string }> {
  const fields = encodeURIComponent('id,name,email');
  const token = encodeURIComponent(accessToken);
  const graphUrl = `https://graph.facebook.com/me?fields=${fields}&access_token=${token}`;

  const resp = await fetch(graphUrl, { method: 'GET' });
  if (!resp.ok) {
    throw new HttpError(
      `Facebook Graph API error: ${resp.status} ${resp.statusText}`,
      500
    );
  }

  return resp.json();
}
