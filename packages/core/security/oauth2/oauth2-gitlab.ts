import { AuthSource, config } from '@appweaver/common';
import { UserInfo } from '../../types';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import { fetchUserInfo, requireEmail, splitFullName } from './oauth2-util';

type GitlabUser = {
  id: number;
  username: string;
  name?: string;
  email?: string;
  avatar_url?: string;
};

const baseUrl = config.SECURITY_OAUTH2_GITLAB_BASE_URL.replace(/\/$/, '');

export const oauth2Gitlab = createOAuth2Plugin(AuthSource.OAuth2Gitlab, {
  enabled: config.SECURITY_OAUTH2_GITLAB_ENABLED,
  clientId: config.SECURITY_OAUTH2_GITLAB_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_GITLAB_CLIENT_SECRET,
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
    config.SECURITY_OAUTH2_GITLAB_USER_INFO_URL,
    accessToken
  );

  return {
    id: String(data.id),
    email: requireEmail('GitLab', data.email),
    ...splitFullName(data.name ?? data.username),
    avatarUrl: data.avatar_url
  };
}
