import { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import oauthPlugin, { ProviderConfiguration } from '@fastify/oauth2';
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
import { OAuth2Service } from './oauth2-service';
import { validateRedirectUrl } from '../helper';
import {
  AuthOTTData,
  AvatarFile,
  OAuth2StateData,
  OAuth2TokenSet,
  OAuth2UserInfoContext,
  Server,
  UserInfo
} from '../../types';
import {
  createOAuth2CallbackSchema,
  createOAuth2RedirectSchema
} from './oauth2-schema';

export type { UserInfo, OAuth2TokenSet, OAuth2UserInfoContext };

export type OAuth2Config = {
  enabled: boolean;
  clientId?: string;
  /** A function is resolved lazily, only once the provider is known to be enabled. */
  clientSecret?: string | (() => string | undefined);
  issuer?: string;
  scope: string[];
  /** Provider endpoints. Defaults to the `@fastify/oauth2` preset matching the auth source name. */
  auth?: ProviderConfiguration;
  /** Human-readable provider name used in the generated OpenAPI schema. Defaults to the auth source name. */
  displayName?: string;
  /** Enables the PKCE extension, required by providers such as X. */
  pkce?: 'S256' | 'plain';
  /** Provider posts the authorization response as a form body instead of query parameters (`response_mode=form_post`). */
  formPostCallback?: boolean;
  /** `User-Agent` sent with the token request. Some providers reject the default one. */
  userAgent?: string;
  /** How client credentials are sent to the token endpoint. Defaults to `header` (HTTP Basic); providers such as
   * Apple and LinkedIn only accept them in the request body. */
  authorizationMethod?: 'header' | 'body';
  extractUserInfo: (
    accessToken: string,
    context: OAuth2UserInfoContext
  ) => Promise<UserInfo>;
};

export function createOAuth2Plugin(
  authSource: AuthSource,
  oAuth2Config: OAuth2Config
) {
  const name = authSource.replace('oauth2', '');
  const upperName = name.toUpperCase();
  const lowerName = name.toLowerCase();
  const displayName = oAuth2Config.displayName ?? name;

  return fastifyPlugin(async (server: Server) => {
    if (!oAuth2Config.enabled) {
      return;
    }

    const clientSecret =
      typeof oAuth2Config.clientSecret === 'function'
        ? oAuth2Config.clientSecret()
        : oAuth2Config.clientSecret;

    if (!oAuth2Config.clientId || !clientSecret) {
      throw Error(`${name} OAuth2 configuration is missing`);
    }

    if (server[authSource] !== undefined) {
      throw Error(`${name} OAuth2 provider is already registered`);
    }

    const authConfig =
      oAuth2Config.auth ?? oauthPlugin[`${upperName}_CONFIGURATION`];
    if (!authConfig && !oAuth2Config.issuer) {
      throw Error(`${name} OAuth2 provider is not supported`);
    }

    const authService = inject(AuthService);
    const oauth2Service = inject(OAuth2Service);
    const securityStore = inject(SecurityStore);

    const prefix = config.SECURITY_ROUTE_PREFIX.replace(/\/$/, '');
    const callbackPath = `${prefix}/login/${lowerName}/callback`;

    // With `response_mode=form_post` the authorization response arrives in the request body, while
    // @fastify/oauth2 always reads the `code` and `state` from the query string.
    const authResponse = (request: FastifyRequest): Record<string, string> =>
      (oAuth2Config.formPostCallback
        ? (request.body as Record<string, string>)
        : (request.query as Record<string, string>)) ?? {};

    server.register(oauthPlugin, {
      name: authSource,
      credentials: {
        client: {
          id: oAuth2Config.clientId,
          secret: clientSecret
        },
        auth: authConfig,
        ...(oAuth2Config.authorizationMethod
          ? {
              options: { authorizationMethod: oAuth2Config.authorizationMethod }
            }
          : {})
      },
      ...(oAuth2Config.issuer
        ? { discovery: { issuer: oAuth2Config.issuer } }
        : {}),
      scope: oAuth2Config.scope,
      schema: createOAuth2RedirectSchema(displayName),
      startRedirectPath: `${prefix}/login/${lowerName}`,
      callbackUri: `${config.APP_HOSTNAME}${callbackPath}`,
      ...(oAuth2Config.pkce ? { pkce: oAuth2Config.pkce } : {}),
      ...(oAuth2Config.userAgent ? { userAgent: oAuth2Config.userAgent } : {}),
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
        const state = authResponse(request).state;

        request.oauth2State =
          await securityStore.useOneTimeToken<OAuth2StateData>(
            state,
            AuthOTTPurpose.OAuth2State
          );

        return true;
      }
    });

    const callbackHandler = async function (request: any, reply: any) {
      const { token } =
        await server[authSource].getAccessTokenFromAuthorizationCodeFlow(
          request
        );

      const userInfo = await oAuth2Config.extractUserInfo(token.access_token, {
        token: token as OAuth2TokenSet,
        request
      });

      let authUser = await authService.findByUsername(userInfo.email);

      await oauth2Service.checkUser(authSource, userInfo, authUser);

      // Decided before the user is (possibly) registered, so a freshly created account is never asked to confirm
      const passwordRequired =
        !!authUser &&
        (await oauth2Service.requiresPasswordConfirmation(
          authUser,
          authSource,
          userInfo.id
        ));

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
            ...pickProperties(userInfo, ['firstName', 'lastName', 'avatarUrl']),
            avatarFile: userInfo.avatarFile ?? (await fetchAvatarFile(userInfo))
          }
        );
      }

      const stateData: OAuth2StateData = request.oauth2State;

      const ott = await securityStore.generateOneTimeToken<AuthOTTData>(
        AuthOTTPurpose.Authentication,
        {
          authUserId: authUser.id,
          authSource,
          providerAccountId: userInfo.id,
          scope: (token.scope as string) ?? oAuth2Config.scope.join(' '),
          passwordRequired
        },
        config.SECURITY_AUTH_OTT_TTL
      );

      const separator = stateData.redirectToUrl.includes('?') ? '&' : '?';
      // Tell the client upfront so it can collect the password before spending the single-use token
      const confirmation = passwordRequired ? '&passwordRequired=true' : '';

      return reply.redirect(
        `${stateData.redirectToUrl}${separator}token=${ott}${confirmation}`
      );
    };

    if (!oAuth2Config.formPostCallback) {
      server.get(
        callbackPath,
        { schema: createOAuth2CallbackSchema(displayName) },
        callbackHandler
      );
      return;
    }

    // Register the form-post callback in an encapsulated scope so its urlencoded body parser and
    // the query rewrite below stay local to this single route.
    await server.register(async (scope: Server) => {
      if (!scope.hasContentTypeParser('application/x-www-form-urlencoded')) {
        scope.addContentTypeParser(
          'application/x-www-form-urlencoded',
          { parseAs: 'string' },
          (_request, body: string, done) =>
            done(null, Object.fromEntries(new URLSearchParams(body)))
        );
      }

      scope.post(
        callbackPath,
        {
          schema: createOAuth2CallbackSchema(displayName, true),
          preHandler: async (request) => {
            // @fastify/oauth2 reads the authorization code off the query string only.
            const { code, state } = authResponse(request);
            request.query = { ...(request.query as object), code, state };
          }
        },
        callbackHandler
      );
    });
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
