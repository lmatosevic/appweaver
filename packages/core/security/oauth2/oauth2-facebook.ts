import { AuthSource } from '@appweaver/common';
import { oauth2Config } from '../security-config';
import { UserInfo } from '../../types';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import { fetchUserInfo, requireEmail, splitFullName } from './oauth2-util';

type FacebookUser = {
  id: string;
  name?: string;
  email?: string;
  picture?: { data?: { url?: string } };
};

export const oauth2Facebook = createOAuth2Plugin(AuthSource.OAuth2Facebook, {
  enabled: oauth2Config.FACEBOOK_ENABLED,
  clientId: oauth2Config.FACEBOOK_CLIENT_ID,
  clientSecret: oauth2Config.FACEBOOK_CLIENT_SECRET,
  scope: ['public_profile', 'email'],
  extractUserInfo: (accessToken) => fetchFacebookUser(accessToken)
});

export async function fetchFacebookUser(
  accessToken: string
): Promise<UserInfo> {
  const params = new URLSearchParams();
  params.append('fields', 'id,name,email,picture.width(512)');

  const data = await fetchUserInfo<FacebookUser>(
    'Facebook Graph',
    `${oauth2Config.FACEBOOK_USER_INFO_URL}?${params}`,
    accessToken
  );

  return {
    id: data.id,
    email: requireEmail('Facebook', data.email),
    ...splitFullName(data.name),
    avatarUrl: data.picture?.data?.url
  };
}
