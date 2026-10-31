import { AuthSource, ErrorCode, OAuth2Error } from '@appweaver/common';
import { oauth2XConfig } from '../security-config';
import { UserInfo } from '@appweaver/data';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import { fetchUserInfo, splitFullName } from './oauth2-util';

type XUser = {
  data: {
    id: string;
    name: string;
    username: string;
    confirmed_email?: string;
    profile_image_url?: string;
  };
};

export const oauth2X = createOAuth2Plugin(AuthSource.OAuth2X, {
  enabled: oauth2XConfig.ENABLED,
  authorizationParams: oauth2XConfig.AUTHORIZATION_PARAMS,
  clientId: oauth2XConfig.CLIENT_ID,
  clientSecret: oauth2XConfig.CLIENT_SECRET,
  scope: ['users.read', 'tweet.read'],
  // X only issues tokens for authorization requests using the PKCE extension.
  pkce: 'S256',
  extractUserInfo: (accessToken) => fetchXUser(accessToken)
});

export async function fetchXUser(accessToken: string): Promise<UserInfo> {
  const params = new URLSearchParams();
  params.append(
    'user.fields',
    'name,username,profile_image_url,confirmed_email'
  );

  // Only apps granted the email permission may read `confirmed_email`; for the rest X rejects the request outright.
  const { data } = await fetchUserInfo<XUser>(
    'X',
    `${oauth2XConfig.USER_INFO_URL}?${params}`,
    accessToken
  );

  if (!data.confirmed_email) {
    throw new OAuth2Error(
      ErrorCode.OAuth2EmailUnavailable,
      'X did not return an email address. Enable the email permission for the app in the X developer portal',
      { provider: 'X' }
    );
  }

  return {
    id: data.id,
    email: data.confirmed_email,
    ...splitFullName(data.name),
    // The profile image URL points at the 48px variant; ask for the largest one X keeps.
    avatarUrl: data.profile_image_url?.replace('_normal.', '_400x400.')
  };
}
