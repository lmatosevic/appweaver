import fastifyPlugin from 'fastify-plugin';
import oauthPlugin from '@fastify/oauth2';
import { AuthType, config } from '@appweaver/common';
import { inject } from '../../context';
import { HttpError } from '../../errors';
import { AuthService } from '../auth-service';
import {
  createOAuth2CallbackSchema,
  createOAuth2RedirectSchema
} from '../auth-schema';
import { Server } from '../../types';

export const oauth2Google = fastifyPlugin(
  async (server: Server): Promise<void> => {
    if (!config.SECURITY_OAUTH2_GOOGLE_ENABLED) {
      return;
    }

    if (
      !config.SECURITY_OAUTH2_GOOGLE_CLIENT_ID ||
      !config.SECURITY_OAUTH2_GOOGLE_CLIENT_SECRET
    ) {
      throw Error('Google OAuth2 configuration is missing');
    }

    const authService = inject(AuthService);

    const prefix = config.SECURITY_ROUTE_PREFIX.replace(/\/$/, '');

    server.register(oauthPlugin, {
      name: 'googleOAuth2',
      credentials: {
        client: {
          id: config.SECURITY_OAUTH2_GOOGLE_CLIENT_ID,
          secret: config.SECURITY_OAUTH2_GOOGLE_CLIENT_SECRET
        },
        auth: oauthPlugin.GOOGLE_CONFIGURATION
      },
      scope: ['profile', 'email'],
      schema: createOAuth2RedirectSchema('Google'),
      startRedirectPath: `${prefix}/login/google`,
      callbackUri: `${config.APP_HOSTNAME}${prefix}/login/google/callback`,
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
      `${prefix}/login/google/callback`,
      {
        schema: createOAuth2CallbackSchema('Google')
      },
      async function (request, reply) {
        const { token } =
          await server.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(
            request
          );

        const googleUser = await fetchGoogleUser(token.access_token);

        let authUser = await authService.findByUsername(googleUser.email);
        if (!authUser) {
          authUser = await authService.registerAuthUser(
            AuthType.Oauth2Google,
            googleUser.email,
            undefined,
            {
              firstName: googleUser.given_name,
              lastName: googleUser.family_name
            }
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

async function fetchGoogleUser(accessToken: string): Promise<{
  id: string;
  email: string;
  given_name: string;
  family_name: string;
}> {
  const token = encodeURIComponent(accessToken);
  const googleUrl = `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`;

  const resp = await fetch(googleUrl, { method: 'GET' });
  if (!resp.ok) {
    throw new HttpError(
      `Google API error: ${resp.status} ${resp.statusText}`,
      500
    );
  }

  return resp.json();
}
