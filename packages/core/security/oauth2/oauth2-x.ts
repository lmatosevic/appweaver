import { AuthSource, config } from '@appweaver/common';
import { HttpError } from '../../errors';
import { UserInfo } from '../../types';
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
  enabled: config.SECURITY_OAUTH2_X_ENABLED,
  clientId: config.SECURITY_OAUTH2_X_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_X_CLIENT_SECRET,
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
    `${config.SECURITY_OAUTH2_X_USER_INFO_URL}?${params}`,
    accessToken
  );

  if (!data.confirmed_email) {
    throw new HttpError(
      'X did not return an email address. Enable the email permission for the app in the X developer portal',
      403
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
