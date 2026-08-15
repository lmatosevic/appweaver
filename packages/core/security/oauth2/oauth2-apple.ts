import { AuthSource, config, logger } from '@appweaver/common';
import { OAuth2UserInfoContext, UserInfo } from '../../types';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import {
  createAppleClientSecret,
  decodeJwtPayload,
  requireEmail
} from './oauth2-util';

type AppleIdToken = {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
};

type AppleFormUser = {
  name?: {
    firstName?: string;
    lastName?: string;
  };
};

export const oauth2Apple = createOAuth2Plugin(AuthSource.OAuth2Apple, {
  enabled: config.SECURITY_OAUTH2_APPLE_ENABLED,
  clientId: config.SECURITY_OAUTH2_APPLE_CLIENT_ID,
  // Resolved lazily so the signing key is only read when the provider is actually enabled.
  clientSecret: createAppleClientSecret,
  scope: ['name', 'email'],
  // Requesting the name or email scope makes Apple post the authorization response as a form body.
  formPostCallback: true,
  // Apple's token endpoint rejects HTTP Basic credentials.
  authorizationMethod: 'body',
  extractUserInfo: (_accessToken, context) => extractAppleUser(context)
});

/**
 * Builds the user info from Apple's token response. Apple has no user info endpoint: the identity is carried by the
 * `id_token`, and the display name is posted alongside the authorization code on the very first authorization only.
 *
 * @param {OAuth2UserInfoContext} context - The token set and callback request from the authorization code flow.
 * @return {Promise<UserInfo>} A promise resolving to the extracted user info.
 */
export async function extractAppleUser({
  token,
  request
}: OAuth2UserInfoContext): Promise<UserInfo> {
  const claims = decodeJwtPayload<AppleIdToken>('Apple', token.id_token);
  const name = parseAppleFormUser(request.body)?.name;

  return {
    id: claims.sub,
    email: requireEmail('Apple', claims.email),
    firstName: name?.firstName ?? '',
    lastName: name?.lastName ?? ''
  };
}

/**
 * Parses the JSON encoded `user` field Apple posts to the callback on the first authorization. Malformed values are
 * logged and ignored, since the rest of the identity comes from the identity token.
 *
 * @param {unknown} body - The parsed form body of the callback request.
 * @return {AppleFormUser | undefined} The decoded profile, or `undefined` when it is absent or unreadable.
 */
function parseAppleFormUser(body: unknown): AppleFormUser | undefined {
  const raw = (body as Record<string, string> | undefined)?.user;
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    logger.debug({ err: e }, 'Apple OAuth2 user payload is malformed');
    return undefined;
  }
}
