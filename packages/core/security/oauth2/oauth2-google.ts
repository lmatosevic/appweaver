import { AuthSource, config } from '@appweaver/common';
import { HttpError } from '../../errors';
import { createOAuth2Plugin, UserInfo } from './create-oauth2-plugin';

export const oauth2Google = createOAuth2Plugin(AuthSource.OAuth2Google, {
  enabled: config.SECURITY_OAUTH2_GOOGLE_ENABLED,
  clientId: config.SECURITY_OAUTH2_GOOGLE_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_GOOGLE_CLIENT_SECRET,
  scope: ['profile', 'email'],
  extractUserInfo: (accessToken) => fetchGoogleUser(accessToken)
});

async function fetchGoogleUser(accessToken: string): Promise<UserInfo> {
  const token = encodeURIComponent(accessToken);
  const googleUrl = `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`;

  const resp = await fetch(googleUrl, { method: 'GET' });
  if (!resp.ok) {
    throw new HttpError(
      `Google API error: ${resp.status} ${resp.statusText}`,
      500
    );
  }

  const data = await resp.json();

  return {
    id: data.id,
    email: data.email,
    firstName: data.given_name,
    lastName: data.family_name
  };
}
