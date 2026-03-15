import { AuthSource, config } from '@appweaver/common';
import { context } from '../../context';
import { HttpError } from '../../errors';
import { createOAuth2Plugin, UserInfo } from './create-oauth2-plugin';

export const oauth2Custom = createOAuth2Plugin(AuthSource.OAuth2Custom, {
  enabled: config.SECURITY_OAUTH2_CUSTOM_ENABLED,
  clientId: config.SECURITY_OAUTH2_CUSTOM_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_CUSTOM_CLIENT_SECRET,
  issuer: config.SECURITY_OAUTH2_CUSTOM_ISSUER,
  scope: ['openid', 'profile', 'email'],
  extractUserInfo: (accessToken) => fetchCustomUser(accessToken)
});

async function fetchCustomUser(accessToken: string): Promise<UserInfo> {
  const server = context.server;
  if (!server) {
    throw new HttpError('Server is not available', 500);
  }

  const customOauth2 = server[AuthSource.OAuth2Custom];

  let data: any;
  if (typeof customOauth2?.userinfo === 'function') {
    data = await customOauth2.userinfo(accessToken);
  } else {
    // Fallback to direct API call if the plugin is not initialized
    const resp = await fetch(
      `${config.SECURITY_OAUTH2_CUSTOM_ISSUER}/protocol/openid-connect/userinfo`,
      { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } }
    );
    if (!resp.ok) {
      throw new HttpError(
        `Custom OAuth2 API error: ${resp.status} ${resp.statusText}`,
        500
      );
    }
    data = await resp.json();
  }

  return {
    id: data.sub,
    email: data.email,
    firstName: data.given_name,
    lastName: data.family_name
  };
}
