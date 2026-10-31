import { AuthSource } from '@appweaver/common';
import { oauth2GoogleConfig } from '../security-config';
import { UserInfo } from '@appweaver/data';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import { fetchUserInfo, requireEmail } from './oauth2-util';

type GoogleUser = {
  id: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

export const oauth2Google = createOAuth2Plugin(AuthSource.OAuth2Google, {
  enabled: oauth2GoogleConfig.ENABLED,
  authorizationParams: oauth2GoogleConfig.AUTHORIZATION_PARAMS,
  clientId: oauth2GoogleConfig.CLIENT_ID,
  clientSecret: oauth2GoogleConfig.CLIENT_SECRET,
  scope: ['profile', 'email'],
  extractUserInfo: (accessToken) => fetchGoogleUser(accessToken)
});

export async function fetchGoogleUser(accessToken: string): Promise<UserInfo> {
  const data = await fetchUserInfo<GoogleUser>(
    'Google',
    oauth2GoogleConfig.USER_INFO_URL,
    accessToken
  );

  return {
    id: data.id,
    email: requireEmail('Google', data.email),
    firstName: data.given_name ?? '',
    lastName: data.family_name ?? '',
    avatarUrl: data.picture
  };
}
