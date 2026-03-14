import { AuthType, config } from '@appweaver/common';
import { HttpError } from '../../errors';
import { createOAuth2Plugin, UserInfo } from './create-oauth2-plugin';

export const oauth2Facebook = createOAuth2Plugin(AuthType.OAuth2Facebook, {
  enabled: config.SECURITY_OAUTH2_FACEBOOK_ENABLED,
  clientId: config.SECURITY_OAUTH2_FACEBOOK_CLIENT_ID,
  clientSecret: config.SECURITY_OAUTH2_FACEBOOK_CLIENT_SECRET,
  scope: ['public_profile', 'email'],
  extractUserInfo: (accessToken) => fetchFacebookUser(accessToken)
});

async function fetchFacebookUser(accessToken: string): Promise<UserInfo> {
  const fields = encodeURIComponent('id,name,email');
  const token = encodeURIComponent(accessToken);
  const graphUrl = `https://graph.facebook.com/me?fields=${fields}&access_token=${token}`;

  const resp = await fetch(graphUrl, { method: 'GET' });
  if (!resp.ok) {
    throw new HttpError(
      `Facebook Graph API error: ${resp.status} ${resp.statusText}`,
      500
    );
  }

  const data = await resp.json();
  const [firstName, lastName] = data.name.split(' ');

  return {
    id: data.id,
    email: data.email,
    firstName,
    lastName
  };
}
