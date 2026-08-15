import { AuthSource, config } from '@appweaver/common';
import { HttpError } from '../../errors';
import { UserInfo } from '../../types';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import { fetchUserInfo, splitFullName } from './oauth2-util';

type GithubUser = {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
};

type GithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

const GITHUB_HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'appweaver'
};

export const oauth2Github = createOAuth2Plugin(AuthSource.OAuth2Github, {
  enabled: config.SECURITY_OAUTH2_GITHUB_ENABLED,
  clientId: config.SECURITY_OAUTH2_GITHUB_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_GITHUB_CLIENT_SECRET,
  displayName: 'GitHub',
  scope: ['read:user', 'user:email'],
  extractUserInfo: (accessToken) => fetchGithubUser(accessToken)
});

export async function fetchGithubUser(accessToken: string): Promise<UserInfo> {
  const data = await fetchUserInfo<GithubUser>(
    'GitHub',
    config.SECURITY_OAUTH2_GITHUB_USER_INFO_URL,
    accessToken,
    GITHUB_HEADERS
  );

  return {
    id: String(data.id),
    email: data.email ?? (await fetchGithubEmail(accessToken)),
    ...splitFullName(data.name ?? data.login),
    avatarUrl: data.avatar_url
  };
}

/**
 * Resolves the user's email address from the dedicated emails endpoint, needed because GitHub omits it from the user
 * profile whenever the address is kept private.
 *
 * @param {string} accessToken - The access token obtained from the authorization code flow.
 * @return {Promise<string>} A promise resolving to the primary verified address, or the first verified one.
 * @throws {HttpError} If the account has no verified email address.
 */
async function fetchGithubEmail(accessToken: string): Promise<string> {
  const emails = await fetchUserInfo<GithubEmail[]>(
    'GitHub',
    `${config.SECURITY_OAUTH2_GITHUB_USER_INFO_URL}/emails`,
    accessToken,
    GITHUB_HEADERS
  );

  const verified = emails.filter((email) => email.verified);
  const email = verified.find((email) => email.primary) ?? verified[0];

  if (!email) {
    throw new HttpError('GitHub account has no verified email address', 403);
  }

  return email.email;
}
