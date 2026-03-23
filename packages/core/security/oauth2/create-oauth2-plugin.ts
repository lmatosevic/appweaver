import fastifyPlugin from 'fastify-plugin';
import oauthPlugin from '@fastify/oauth2';
import {
  AuthOTTPurpose,
  AuthScope,
  AuthSource,
  config,
  pickProperties,
  SecurityStore
} from '@appweaver/common';
import { inject } from '../../context';
import { HttpError } from '../../errors';
import { AuthService } from '../auth-service';
import { validateRedirectUrl } from '../helper';
import { AuthOTTData, OAuth2StateData, Server } from '../../types';
import {
  createOAuth2CallbackSchema,
  createOAuth2RedirectSchema
} from './oauth2-schema';

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
  issuer?: string;
  scope: string[];
  extractUserInfo: (accessToken: string) => Promise<UserInfo>;
};

export function createOAuth2Plugin(
  authSource: AuthSource,
  oAuth2Config: OAuth2Config
) {
  const name = authSource.replace('oauth2', '');
  const upperName = name.toUpperCase();
  const lowerName = name.toLowerCase();

  return fastifyPlugin(async (server: Server) => {
    if (!oAuth2Config.enabled) {
      return;
    }

    if (!oAuth2Config.clientId || !oAuth2Config.clientSecret) {
      throw Error(`${name} OAuth2 configuration is missing`);
    }

    if (server[authSource] !== undefined) {
      throw Error(`${name} OAuth2 provider is already registered`);
    }

    const authConfig = oauthPlugin[`${upperName}_CONFIGURATION`];
    if (!authConfig && !oAuth2Config.issuer) {
      throw Error(`${name} OAuth2 provider is not supported`);
    }

    const authService = inject(AuthService);
    const securityStore = inject(SecurityStore);

    const prefix = config.SECURITY_ROUTE_PREFIX.replace(/\/$/, '');

    server.register(oauthPlugin, {
      name: authSource,
      credentials: {
        client: {
          id: oAuth2Config.clientId,
          secret: oAuth2Config.clientSecret
        },
        auth: authConfig
      },
      ...(oAuth2Config.issuer
        ? { discovery: { issuer: oAuth2Config.issuer } }
        : {}),
      scope: oAuth2Config.scope,
      schema: createOAuth2RedirectSchema(name),
      startRedirectPath: `${prefix}/login/${lowerName}`,
      callbackUri: `${config.APP_HOSTNAME}${prefix}/login/${lowerName}/callback`,
      generateStateFunction: async (request: any) => {
        const redirectToUrl = request.query.redirectToUrl as string;
        const result = validateRedirectUrl(redirectToUrl);

        if (!result.valid) {
          throw new HttpError(result.message, 400);
        }

        return securityStore.generateOneTimeToken<OAuth2StateData>(
          AuthOTTPurpose.OAuth2State,
          { redirectToUrl },
          config.SECURITY_OAUTH2_STATE_TTL
        );
      },
      checkStateFunction: async (request: any) => {
        const state = request.query.state as string;

        request.oauth2State =
          await securityStore.useOneTimeToken<OAuth2StateData>(
            state,
            AuthOTTPurpose.OAuth2State
          );

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
          await server[authSource].getAccessTokenFromAuthorizationCodeFlow(
            request
          );

        const userInfo = await oAuth2Config.extractUserInfo(token.access_token);

        let authUser = await authService.findByUsername(userInfo.email);
        if (!authUser) {
          authUser = await authService.registerAuthUser(
            authSource,
            userInfo.email,
            undefined,
            pickProperties(userInfo, ['firstName', 'lastName'])
          );
        } else if (!authUser.verifiedEmail) {
          throw new HttpError('Auth user email address is not verified', 403);
        }

        const stateData: OAuth2StateData = (request as any).oauth2State;

        if ((request.query as any).returnAuthTokens) {
          const authResponse = await authService.generateAuthTokens(
            authUser,
            AuthScope.Auth,
            authSource
          );
          return reply.send(authResponse);
        }

        const ott = await securityStore.generateOneTimeToken<AuthOTTData>(
          AuthOTTPurpose.Authentication,
          { authUserId: authUser.id, authSource },
          config.SECURITY_AUTH_OTT_TTL
        );

        const separator = stateData.redirectToUrl.includes('?') ? '&' : '?';

        return reply.redirect(
          `${stateData.redirectToUrl}${separator}token=${ott}`
        );
      }
    );
  });
}
