import { AuthSource } from '@appweaver/common';
import { oauth2MicrosoftConfig } from '../security-config';
import { UserInfo } from '@appweaver/data';
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

const tenant = oauth2MicrosoftConfig.TENANT;

export const oauth2Microsoft = createOAuth2Plugin(AuthSource.OAuth2Microsoft, {
  enabled: oauth2MicrosoftConfig.ENABLED,
  authorizationParams: oauth2MicrosoftConfig.AUTHORIZATION_PARAMS,
  clientId: oauth2MicrosoftConfig.CLIENT_ID,
  clientSecret: oauth2MicrosoftConfig.CLIENT_SECRET,
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
  const userInfoUrl = oauth2MicrosoftConfig.USER_INFO_URL;

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
