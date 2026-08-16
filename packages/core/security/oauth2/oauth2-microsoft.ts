import { AuthSource, config } from '@appweaver/common';
import { UserInfo } from '../../types';
import { createOAuth2Plugin } from './create-oauth2-plugin';
import {
  fetchAvatarFile,
  fetchUserInfo,
  requireEmail,
  splitFullName
} from './oauth2-util';

type MicrosoftUser = {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName?: string;
};

const tenant = config.SECURITY_OAUTH2_MICROSOFT_TENANT;

export const oauth2Microsoft = createOAuth2Plugin(AuthSource.OAuth2Microsoft, {
  enabled: config.SECURITY_OAUTH2_MICROSOFT_ENABLED,
  clientId: config.SECURITY_OAUTH2_MICROSOFT_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_MICROSOFT_CLIENT_SECRET,
  scope: ['openid', 'profile', 'email', 'User.Read'],
  // Built from the configured tenant rather than the bundled preset, which is hardcoded to `common`.
  auth: {
    authorizeHost: 'https://login.microsoftonline.com',
    authorizePath: `/${tenant}/oauth2/v2.0/authorize`,
    tokenHost: 'https://login.microsoftonline.com',
    tokenPath: `/${tenant}/oauth2/v2.0/token`
  },
  extractUserInfo: (accessToken) => fetchMicrosoftUser(accessToken)
});

export async function fetchMicrosoftUser(
  accessToken: string
): Promise<UserInfo> {
  const userInfoUrl = config.SECURITY_OAUTH2_MICROSOFT_USER_INFO_URL;

  const data = await fetchUserInfo<MicrosoftUser>(
    'Microsoft',
    userInfoUrl,
    accessToken
  );

  const { firstName, lastName } = splitFullName(data.displayName);

  return {
    id: data.id,
    // Work accounts expose `mail`, personal ones only the principal name.
    email: requireEmail('Microsoft', data.mail ?? data.userPrincipalName),
    firstName: data.givenName ?? firstName,
    lastName: data.surname ?? lastName,
    // Microsoft Graph serves the photo as authenticated binary content, so it has to be downloaded here.
    avatarFile: await fetchAvatarFile(
      `${userInfoUrl}/photo/$value`,
      data.id,
      accessToken
    )
  };
}
