import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import {
  ConfigurationError,
  ErrorCode,
  createLogger,
  OAuth2Error
} from '@appweaver/common';
import { oauth2Config, oauth2AppleConfig } from '../security-config';
import { AvatarFile } from '@appweaver/data';

const logger = createLogger('security');

const APPLE_TOKEN_AUDIENCE = 'https://appleid.apple.com';

/**
 * Calls an OAuth2 provider's user info endpoint with the access token and returns the parsed JSON body.
 *
 * @param {string} providerName - Provider name used in the error message.
 * @param {string} url - The user info endpoint to call.
 * @param {string} accessToken - The access token obtained from the authorization code flow.
 * @param {Record<string, string>} [headers] - Extra request headers required by the provider.
 * @return {Promise<Object>} A promise resolving to the parsed response body.
 * @throws {OAuth2Error} `OAUTH2_PROVIDER_ERROR` if the provider responds with a non-2xx status.
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
    throw new OAuth2Error(
      ErrorCode.OAuth2ProviderError,
      `${providerName} API error: ${resp.status} ${resp.statusText}`,
      { provider: providerName, status: resp.status }
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
  if (!oauth2Config.FETCH_AVATAR_ENABLED) {
    return undefined;
  }

  if (!url) {
    return undefined;
  }

  try {
    const resp = await fetchPublicImage(url, accessToken);
    if (!resp) {
      return undefined;
    }

    const mimeType = resp.mimeType;
    const extension = mimeType.split('/')[1];

    return {
      name: `avatar-${id}.${extension}`,
      mimeType,
      size: resp.data.length,
      data: resp.data
    };
  } catch (e) {
    logger.error({ url, err: e }, 'OAuth2 avatar fetch error');
    return undefined;
  }
}

/** The largest avatar downloaded, the redirects followed and the time a download may take. */
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const AVATAR_MAX_REDIRECTS = 3;
const AVATAR_TIMEOUT = 10_000;
const AVATAR_TYPES = /^image\/(jpeg|png|gif|webp|avif)$/;

// The addresses of the host, its network and the cloud metadata endpoints, never fetched from a URL a profile reports
const privateAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16]
] as const) {
  privateAddresses.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10]
] as const) {
  privateAddresses.addSubnet(address, prefix, 'ipv6');
}

/**
 * Checks a URL a provider reported before it is fetched: HTTPS only, and never a local host or a private address
 * literal. A host name resolving to a private address is not detected.
 *
 * @param {string} url - The URL to check.
 * @return {URL | undefined} The parsed URL, or `undefined` when it must not be fetched.
 */
export function publicHttpsUrl(url: string): URL | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    parsed.protocol !== 'https:' ||
    host === 'localhost' ||
    host.endsWith('.localhost')
  ) {
    return undefined;
  }
  const family = isIP(host);
  if (family) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host)?.[1];
    if (
      mapped
        ? privateAddresses.check(mapped, 'ipv4')
        : privateAddresses.check(host, family === 4 ? 'ipv4' : 'ipv6')
    ) {
      return undefined;
    }
  }
  return parsed;
}

/**
 * Downloads an image from a URL a provider reported, following its redirects only to other public HTTPS URLs, within
 * a size and a time limit, and only when it is a raster image.
 */
async function fetchPublicImage(
  url: string,
  accessToken?: string
): Promise<{ mimeType: string; data: Buffer } | undefined> {
  const signal = AbortSignal.timeout(AVATAR_TIMEOUT);
  let target = publicHttpsUrl(url);
  for (let redirects = 0; target; redirects++) {
    const resp = await fetch(target, {
      method: 'GET',
      // The token is only ever sent to the URL the provider gave, never to a redirect
      headers:
        accessToken && redirects === 0
          ? { authorization: `Bearer ${accessToken}` }
          : {},
      redirect: 'manual',
      signal
    });

    const location = resp.headers.get('location');
    if (resp.status >= 300 && resp.status < 400 && location) {
      if (redirects >= AVATAR_MAX_REDIRECTS) {
        break;
      }
      target = publicHttpsUrl(new URL(location, target).toString());
      continue;
    }

    if (!resp.ok) {
      logger.error({ url, status: resp.status }, 'OAuth2 avatar fetch failed');
      return undefined;
    }

    const mimeType = (resp.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!AVATAR_TYPES.test(mimeType)) {
      logger.warn({ url, mimeType }, 'OAuth2 avatar is not an image');
      return undefined;
    }

    const data = await readLimited(resp, AVATAR_MAX_SIZE);
    if (!data) {
      logger.warn({ url }, 'OAuth2 avatar is too large');
      return undefined;
    }
    return { mimeType, data };
  }

  logger.warn(
    { url },
    'OAuth2 avatar URL is not a public HTTPS URL, or redirects too often'
  );
  return undefined;
}

/** Reads a response body, `undefined` once it exceeds the size. */
async function readLimited(
  resp: Response,
  maxSize: number
): Promise<Buffer | undefined> {
  if (Number(resp.headers.get('content-length')) > maxSize) {
    await resp.body?.cancel();
    return undefined;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of resp.body ?? []) {
    size += chunk.length;
    if (size > maxSize) {
      await resp.body?.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
 * Reads a boolean claim, which some providers send as a string (Apple's `email_verified` is `"true"`).
 *
 * @param {unknown} value - The value of the claim.
 * @return {boolean} `true` for `true` or `"true"` only.
 */
export function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Asserts that the provider returned an email address, which the framework needs to match or register the user.
 *
 * @param {string} providerName - Provider name used in the error message.
 * @param {string} [email] - The email address reported by the provider.
 * @return {string} The email address.
 * @throws {OAuth2Error} `OAUTH2_EMAIL_UNAVAILABLE` if the provider did not return an email address.
 */
export function requireEmail(providerName: string, email?: string): string {
  if (!email) {
    throw new OAuth2Error(
      ErrorCode.OAuth2EmailUnavailable,
      `${providerName} account has no email address available`,
      { provider: providerName }
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
 * @throws {OAuth2Error} `OAUTH2_PROVIDER_ERROR` if the token is missing or is not a well-formed JWT.
 */
export function decodeJwtPayload<T>(providerName: string, token?: string): T {
  const payload = token?.split('.')[1];
  if (!payload) {
    throw new OAuth2Error(
      ErrorCode.OAuth2ProviderError,
      `${providerName} identity token is missing`,
      { provider: providerName }
    );
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    throw new OAuth2Error(
      ErrorCode.OAuth2ProviderError,
      `${providerName} identity token is malformed`,
      { provider: providerName },
      { cause: e }
    );
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
  if (oauth2AppleConfig.CLIENT_SECRET) {
    return oauth2AppleConfig.CLIENT_SECRET;
  }

  const clientId = oauth2AppleConfig.CLIENT_ID;
  const teamId = oauth2AppleConfig.TEAM_ID;
  const keyId = oauth2AppleConfig.KEY_ID;
  const privateKey = readApplePrivateKey();

  if (!clientId || !teamId || !keyId || !privateKey) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      'Apple OAuth2 requires either a client secret, or a client ID, team ID, key ID and private key to generate one'
    );
  }

  const issuedAt = Math.floor(Date.now() / 1000);

  return signES256Jwt(
    { alg: 'ES256', kid: keyId, typ: 'JWT' },
    {
      iss: teamId,
      iat: issuedAt,
      exp: issuedAt + oauth2AppleConfig.CLIENT_SECRET_EXPIRES_IN,
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
  const inlineKey = oauth2AppleConfig.PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (inlineKey) {
    return inlineKey;
  }

  const keyPath = oauth2AppleConfig.PRIVATE_KEY_PATH;

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
