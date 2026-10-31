import { AuthSource } from '@appweaver/common';
import { oauth2GitlabConfig } from '../security-config';
import { UserInfo } from '@appweaver/data';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import { fetchUserInfo, requireEmail, splitFullName } from './oauth2-util';

type GitlabUser = {
  id: number;
  username: string;
  name?: string;
  email?: string;
  avatar_url?: string;
};

const baseUrl = oauth2GitlabConfig.BASE_URL.replace(/\/$/, '');

export const oauth2Gitlab = createOAuth2Plugin(AuthSource.OAuth2Gitlab, {
  enabled: oauth2GitlabConfig.ENABLED,
  authorizationParams: oauth2GitlabConfig.AUTHORIZATION_PARAMS,
  clientId: oauth2GitlabConfig.CLIENT_ID,
  clientSecret: oauth2GitlabConfig.CLIENT_SECRET,
  displayName: 'GitLab',
  scope: ['read_user'],
  // Built from the base URL rather than the bundled preset, so self-managed instances work too.
  auth: {
    authorizeHost: baseUrl,
    authorizePath: '/oauth/authorize',
    tokenHost: baseUrl,
    tokenPath: '/oauth/token',
    revokePath: '/oauth/revoke'
  },
  extractUserInfo: (accessToken) => fetchGitlabUser(accessToken)
});

export async function fetchGitlabUser(accessToken: string): Promise<UserInfo> {
  const data = await fetchUserInfo<GitlabUser>(
    'GitLab',
    oauth2GitlabConfig.USER_INFO_URL,
    accessToken
  );

  return {
    id: String(data.id),
    email: requireEmail('GitLab', data.email),
    ...splitFullName(data.name ?? data.username),
    avatarUrl: data.avatar_url
  };
}
