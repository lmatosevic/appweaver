import { AuthSource, ErrorCode, ContextError } from '@appweaver/common';
import { oauth2CustomConfig } from '../security-config';
import { injectCreated } from '@appweaver/core';
import type { HttpServer } from '../../server/http-server';
import { UserInfo } from '@appweaver/data';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import { fetchUserInfo, requireEmail } from './oauth2-util';

export type OAuth2UserInfo = {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

export const oauth2Custom = createOAuth2Plugin(AuthSource.OAuth2Custom, {
  enabled: oauth2CustomConfig.ENABLED,
  authorizationParams: oauth2CustomConfig.AUTHORIZATION_PARAMS,
  clientId: oauth2CustomConfig.CLIENT_ID,
  clientSecret: oauth2CustomConfig.CLIENT_SECRET,
  issuer: oauth2CustomConfig.ISSUER,
  scope: ['openid', 'profile', 'email'],
  extractUserInfo: (accessToken) => fetchCustomUser(accessToken)
});

export async function fetchCustomUser(accessToken: string): Promise<UserInfo> {
  const server = injectCreated<HttpServer>('HttpServer')?.instance;
  if (!server) {
    throw new ContextError(
      ErrorCode.ContextServerUnavailable,
      'Server is not available'
    );
  }

  const customOauth2 = server[AuthSource.OAuth2Custom];

  let data: OAuth2UserInfo;
  if (typeof customOauth2?.userinfo === 'function') {
    data = (await customOauth2.userinfo(accessToken)) as OAuth2UserInfo;
  } else {
    // Fallback to direct API call if the plugin is not initialized
    data = await fetchUserInfo<OAuth2UserInfo>(
      'Custom OAuth2',
      `${oauth2CustomConfig.ISSUER}/protocol/openid-connect/userinfo`,
      accessToken
    );
  }

  return {
    id: data.sub,
    email: requireEmail('Custom OAuth2', data.email),
    firstName: data.given_name ?? '',
    lastName: data.family_name ?? '',
    avatarUrl: data.picture
  };
}
