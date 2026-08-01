import fastifyPlugin from 'fastify-plugin';
import oauthPlugin from '@fastify/oauth2';
import {
  AuthOTTPurpose,
  AuthSource,
  config,
  logger,
  pickProperties,
  SecurityStore
} from '@appweaver/common';
import { inject } from '../../context';
import { HttpError } from '../../errors';
import { AuthService } from '../auth-service';
import { validateRedirectUrl } from '../helper';
import {
  AuthOTTData,
  AvatarFile,
  OAuth2StateData,
  Server,
  UserInfo
} from '../../types';
import {
  createOAuth2CallbackSchema,
  createOAuth2RedirectSchema
} from './oauth2-schema';

export type { UserInfo };

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

        await authService.checkOAuth2User(authSource, userInfo, authUser);

        if (!authUser) {
          if (!config.SECURITY_OAUTH2_REGISTRATION_ENABLED) {
            throw new HttpError(
              'Auth user does not exist and OAuth2 registration is disabled',
              403
            );
          }

          authUser = await authService.registerAuthUser(
            authSource,
            userInfo.email,
            undefined,
            {
              ...pickProperties(userInfo, [
                'firstName',
                'lastName',
                'avatarUrl'
              ]),
              avatarFile: await fetchAvatarFile(userInfo)
            }
          );
        } else if (!authUser.verifiedEmail) {
          throw new HttpError('Auth user email address is not verified', 403);
        }

        const stateData: OAuth2StateData = (request as any).oauth2State;

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

/**
 * Downloads the user's avatar image from the OAuth2 provider so it can be passed to the `registrationData` callback.
 * Fetching is best-effort: any failure is logged and `undefined` is returned so the registration flow is not blocked.
 *
 * @param {UserInfo} userInfo - The user info extracted from the OAuth2 provider, including the optional avatar URL.
 * @return {Promise<AvatarFile | undefined>} A promise resolving to the downloaded avatar file, or `undefined` when
 * avatar fetching is disabled, no avatar URL is available, or the download fails.
 */
async function fetchAvatarFile(
  userInfo: UserInfo
): Promise<AvatarFile | undefined> {
  if (!config.SECURITY_OAUTH2_FETCH_AVATAR_ENABLED || !userInfo.avatarUrl) {
    return undefined;
  }

  try {
    const resp = await fetch(userInfo.avatarUrl, { method: 'GET' });
    if (!resp.ok) {
      logger.debug(
        { url: userInfo.avatarUrl, status: resp.status },
        'OAuth2 avatar fetch failed'
      );
      return undefined;
    }

    const mimeType = resp.headers.get('content-type') ?? 'image/jpeg';
    const data = Buffer.from(await resp.arrayBuffer());
    const extension = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';

    return {
      name: `avatar-${userInfo.id}.${extension}`,
      mimeType,
      size: data.length,
      data
    };
  } catch (e) {
    logger.debug(
      { url: userInfo.avatarUrl, err: e },
      'OAuth2 avatar fetch error'
    );
    return undefined;
  }
}
