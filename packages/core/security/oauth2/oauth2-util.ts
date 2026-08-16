import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { config, logger } from '@appweaver/common';
import { HttpError } from '../../errors';
import { AvatarFile } from '../../types';

const APPLE_TOKEN_AUDIENCE = 'https://appleid.apple.com';

/**
 * Calls an OAuth2 provider's user info endpoint with the access token and returns the parsed JSON body.
 *
 * @param {string} providerName - Provider name used in the error message.
 * @param {string} url - The user info endpoint to call.
 * @param {string} accessToken - The access token obtained from the authorization code flow.
 * @param {Record<string, string>} [headers] - Extra request headers required by the provider.
 * @return {Promise<Object>} A promise resolving to the parsed response body.
 * @throws {HttpError} If the provider responds with a non-2xx status.
 */
export async function fetchUserInfo<T>(
  providerName: string,
  url: string,
  accessToken: string,
  headers: Record<string, string> = {}
): Promise<T> {
  const resp = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, ...headers }
  });

  if (!resp.ok) {
    throw new HttpError(
      `${providerName} API error: ${resp.status} ${resp.statusText}`,
      500
    );
  }

  return resp.json();
}

/**
 * Downloads the user's avatar image so it can be passed to the `registrationData` and `registrationFiles` callbacks as
 * `avatarFile`. Fetching is opt-in through `SECURITY_OAUTH2_FETCH_AVATAR_ENABLED` and best-effort: every reason the
 * image does not arrive is logged and `undefined` is returned, so the registration flow is never blocked by it.
 *
 * @param {string | undefined} url - The avatar endpoint to call.
 * @param {string} id - The provider's user identifier, used to name the file.
 * @param {string} [accessToken] - Access token, for providers whose avatar endpoint requires authentication.
 * @return {Promise<AvatarFile | undefined>} A promise resolving to the downloaded avatar, or `undefined` when
 * fetching is disabled, no avatar URL is available, or the download fails.
 */
export async function fetchAvatarFile(
  url: string | undefined,
  id: string,
  accessToken?: string
): Promise<AvatarFile | undefined> {
  if (!config.SECURITY_OAUTH2_FETCH_AVATAR_ENABLED) {
    return undefined;
  }

  if (!url) {
    return undefined;
  }

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}
    });
    if (!resp.ok) {
      logger.error({ url, status: resp.status }, 'OAuth2 avatar fetch failed');
      return undefined;
    }

    const mimeType = resp.headers.get('content-type') ?? 'image/jpeg';
    const data = Buffer.from(await resp.arrayBuffer());
    const extension = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';

    return {
      name: `avatar-${id}.${extension}`,
      mimeType,
      size: data.length,
      data
    };
  } catch (e) {
    logger.error({ url, err: e }, 'OAuth2 avatar fetch error');
    return undefined;
  }
}

/**
 * Splits a provider's single display name field into a first and last name. Everything after the first whitespace
 * separated word becomes the last name, so multipart surnames are kept intact.
 *
 * @param {string} [fullName] - The full name reported by the provider.
 * @return {{ firstName: string; lastName: string }} The split name parts, empty strings when no name is available.
 */
export function splitFullName(fullName?: string): {
  firstName: string;
  lastName: string;
} {
  const [firstName = '', ...rest] = (fullName ?? '').trim().split(/\s+/);

  return { firstName, lastName: rest.join(' ') };
}

/**
 * Asserts that the provider returned an email address, which the framework needs to match or register the user.
 *
 * @param {string} providerName - Provider name used in the error message.
 * @param {string} [email] - The email address reported by the provider.
 * @return {string} The email address.
 * @throws {HttpError} If the provider did not return an email address.
 */
export function requireEmail(providerName: string, email?: string): string {
  if (!email) {
    throw new HttpError(
      `${providerName} account has no email address available`,
      403
    );
  }

  return email;
}

/**
 * Decodes the payload of a JWT without verifying its signature. Only safe for tokens received directly from a
 * provider's token endpoint over TLS, which OpenID Connect Core 3.1.3.7 explicitly allows.
 *
 * @param {string} providerName - Provider name used in the error message.
 * @param {string} [token] - The JWT to decode.
 * @return {T} The decoded payload.
 * @throws {HttpError} If the token is missing or is not a well-formed JWT.
 */
export function decodeJwtPayload<T>(providerName: string, token?: string): T {
  const payload = token?.split('.')[1];
  if (!payload) {
    throw new HttpError(`${providerName} identity token is missing`, 500);
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    throw new HttpError(`${providerName} identity token is malformed`, 500, e);
  }
}

/**
 * Builds the client secret Apple expects: a short-lived ES256 JWT signed with the team's `.p8` key. A literally
 * configured `SECURITY_OAUTH2_APPLE_CLIENT_SECRET` is used as-is and takes precedence.
 *
 * @return {string} The Apple client secret.
 * @throws {Error} If neither a literal secret nor a complete signing key configuration is available.
 */
export function createAppleClientSecret(): string {
  if (config.SECURITY_OAUTH2_APPLE_CLIENT_SECRET) {
    return config.SECURITY_OAUTH2_APPLE_CLIENT_SECRET;
  }

  const clientId = config.SECURITY_OAUTH2_APPLE_CLIENT_ID;
  const teamId = config.SECURITY_OAUTH2_APPLE_TEAM_ID;
  const keyId = config.SECURITY_OAUTH2_APPLE_KEY_ID;
  const privateKey = readApplePrivateKey();

  if (!clientId || !teamId || !keyId || !privateKey) {
    throw Error(
      'Apple OAuth2 requires either a client secret, or a client ID, team ID, key ID and private key to generate one'
    );
  }

  const issuedAt = Math.floor(Date.now() / 1000);

  return signES256Jwt(
    { alg: 'ES256', kid: keyId, typ: 'JWT' },
    {
      iss: teamId,
      iat: issuedAt,
      exp: issuedAt + config.SECURITY_OAUTH2_APPLE_CLIENT_SECRET_EXPIRES_IN,
      aud: APPLE_TOKEN_AUDIENCE,
      sub: clientId
    },
    privateKey
  );
}

/**
 * Reads the Apple `.p8` private key from its inline configuration value or from the configured file path.
 *
 * @return {string | undefined} The PEM encoded private key, or `undefined` when none is configured.
 */
function readApplePrivateKey(): string | undefined {
  // Escaped newlines survive the trip through an environment variable, so restore them.
  const inlineKey = config.SECURITY_OAUTH2_APPLE_PRIVATE_KEY?.replace(
    /\\n/g,
    '\n'
  );
  if (inlineKey) {
    return inlineKey;
  }

  const keyPath = config.SECURITY_OAUTH2_APPLE_PRIVATE_KEY_PATH;

  return keyPath ? fs.readFileSync(keyPath, 'utf8') : undefined;
}

/**
 * Signs a JWT with the ES256 algorithm.
 *
 * @param {Record<string, unknown>} header - The JOSE header.
 * @param {Record<string, unknown>} payload - The token claims.
 * @param {string} privateKey - The PEM encoded EC private key.
 * @return {string} The signed compact JWT.
 */
function signES256Jwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: string
): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // JOSE expects the raw R||S signature, not the DER encoding Node produces by default.
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  });

  return `${signingInput}.${signature.toString('base64url')}`;
}
