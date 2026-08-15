import { AuthSource, config } from '@appweaver/common';
import { UserInfo } from '../../types';
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
  enabled: config.SECURITY_OAUTH2_LINKEDIN_ENABLED,
  clientId: config.SECURITY_OAUTH2_LINKEDIN_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_LINKEDIN_CLIENT_SECRET,
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
    config.SECURITY_OAUTH2_LINKEDIN_USER_INFO_URL,
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
