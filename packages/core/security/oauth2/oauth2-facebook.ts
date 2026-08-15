import { AuthSource, config } from '@appweaver/common';
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
  enabled: config.SECURITY_OAUTH2_FACEBOOK_ENABLED,
  clientId: config.SECURITY_OAUTH2_FACEBOOK_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_FACEBOOK_CLIENT_SECRET,
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
    `${config.SECURITY_OAUTH2_FACEBOOK_USER_INFO_URL}?${params}`,
    accessToken
  );

  return {
    id: data.id,
    email: requireEmail('Facebook', data.email),
    ...splitFullName(data.name),
    avatarUrl: data.picture?.data?.url
  };
}
