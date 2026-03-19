import fastifyPlugin from 'fastify-plugin';
import oauthPlugin from '@fastify/oauth2';
import { AuthSource, config, pickProperties } from '@appweaver/common';
import { inject } from '../../context';
import { HttpError } from '../../errors';
import { AuthOTTPurpose, AuthService } from '../auth-service';
import { OAuth2State, Server } from '../../types';
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

  return fastifyPlugin(async (server: Server): Promise<void> => {
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
      generateStateFunction: async function (request: any) {
        return authService.generateOAuth2State({
          redirectToUrl: request.query.redirectToUrl
        });
      },
      checkStateFunction: async function (request: any) {
        request.oauth2State = await authService.checkOAuth2State(
          request.query.state
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

        const stateData: OAuth2State = (request as any).oauth2State;

        if ((request.query as any).returnAuthTokens) {
          const authResponse = await authService.generateAuthTokens(authUser);
          return reply.send(authResponse);
        }

        const ott = await authService.generateOneTimeToken(
          AuthOTTPurpose.Authentication,
          authUser.id,
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
