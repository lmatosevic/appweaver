import fastifyPlugin from 'fastify-plugin';
import oauthPlugin from '@fastify/oauth2';
import { AuthType, config, pickProperties } from '@appweaver/common';
import { inject } from '../../context';
import { HttpError } from '../../errors';
import { AuthService } from '../auth-service';
import {
  createOAuth2CallbackSchema,
  createOAuth2RedirectSchema
} from '../auth-schema';
import { Server } from '../../types';

export type UserInfo = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type OAuth2Config = {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  scope: string[];
  extractUserInfo: (accessToken: string) => Promise<UserInfo>;
};

export function createOAuth2Plugin(
  authType: AuthType,
  oAuth2Config: OAuth2Config
) {
  const name = authType.replace('oauth2', '');
  const upperName = name.toUpperCase();
  const lowerName = name.toLowerCase();
  const pluginName = `${lowerName}OAuth2`;

  return fastifyPlugin(async (server: Server): Promise<void> => {
    if (!oAuth2Config.enabled) {
      return;
    }

    if (!oAuth2Config.clientId || !oAuth2Config.clientSecret) {
      throw Error(`${name} OAuth2 configuration is missing`);
    }

    const authConfig = oauthPlugin[`${upperName}_CONFIGURATION`];
    if (!authConfig) {
      throw Error(`${name} OAuth2 provider is not supported`);
    }

    const authService = inject(AuthService);

    const prefix = config.SECURITY_ROUTE_PREFIX.replace(/\/$/, '');

    server.register(oauthPlugin, {
      name: pluginName,
      credentials: {
        client: {
          id: oAuth2Config.clientId,
          secret: oAuth2Config.clientSecret
        },
        auth: authConfig
      },
      scope: oAuth2Config.scope,
      schema: createOAuth2RedirectSchema(name),
      startRedirectPath: `${prefix}/login/${lowerName}`,
      callbackUri: `${config.APP_HOSTNAME}${prefix}/login/${lowerName}/callback`,
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
      `${prefix}/login/${lowerName}/callback`,
      {
        schema: createOAuth2CallbackSchema(name)
      },
      async function (request, reply) {
        const { token } =
          await server[pluginName].getAccessTokenFromAuthorizationCodeFlow(
            request
          );

        const userInfo = await oAuth2Config.extractUserInfo(token.access_token);

        let authUser = await authService.findByUsername(userInfo.email);
        if (!authUser) {
          authUser = await authService.registerAuthUser(
            authType,
            userInfo.email,
            undefined,
            pickProperties(userInfo, ['firstName', 'lastName'])
          );
        } else if (!authUser.verifiedEmail) {
          throw new HttpError('Auth user email address is not verified', 403);
        }

        const ott = await authService.generateOneTimeToken(authUser);

        return reply.redirect(`${(request as any).returnToUrl}?token=${ott}`);
      }
    );
  });
}
