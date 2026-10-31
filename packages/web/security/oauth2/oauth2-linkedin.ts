import { AuthSource } from '@appweaver/common';
import { oauth2LinkedinConfig } from '../security-config';
import { UserInfo } from '@appweaver/data';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import { fetchUserInfo, requireEmail, splitFullName } from './oauth2-util';

type LinkedinUser = {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

export const oauth2Linkedin = createOAuth2Plugin(AuthSource.OAuth2Linkedin, {
  enabled: oauth2LinkedinConfig.ENABLED,
  authorizationParams: oauth2LinkedinConfig.AUTHORIZATION_PARAMS,
  clientId: oauth2LinkedinConfig.CLIENT_ID,
  clientSecret: oauth2LinkedinConfig.CLIENT_SECRET,
  displayName: 'LinkedIn',
  scope: ['openid', 'profile', 'email'],
  // LinkedIn's token endpoint rejects HTTP Basic credentials.
  authorizationMethod: 'body',
  extractUserInfo: (accessToken) => fetchLinkedinUser(accessToken)
});

export async function fetchLinkedinUser(
  accessToken: string
): Promise<UserInfo> {
  const data = await fetchUserInfo<LinkedinUser>(
    'LinkedIn',
    oauth2LinkedinConfig.USER_INFO_URL,
    accessToken
  );

  const { firstName, lastName } = splitFullName(data.name);

  return {
    id: data.sub,
    email: requireEmail('LinkedIn', data.email),
    firstName: data.given_name ?? firstName,
    lastName: data.family_name ?? lastName,
    avatarUrl: data.picture
  };
}
