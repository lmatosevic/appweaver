import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { appConfig } from '@appweaver/common';
import { jwtConfig } from '@appweaver/web/config';
import { mcpConfig, mcpOAuth2Config } from '../config';

/** A client of the authorization server, registered by an MCP client (RFC 7591). */
export type OAuthClient = {
  redirectUris: string[];
  issuedAt: number;
  name?: string;
};

/** The signing keys of the client IDs, by their source. */
const keys = new Map<string, Buffer>();

/** The issuer of the authorization server, the origin of the application. */
export function oauthIssuer(): string {
  return appConfig.HOSTNAME.replace(/\/+$/, '');
}

/** Joins the path of a config to a base, i.e. `/mcp` of `mcp.routePrefix`. */
export function routePath(prefix: string): string {
  return `/${prefix.replace(/^\/+|\/+$/g, '')}`;
}

/** The URL of the MCP endpoint, the resource the access tokens are requested for (RFC 8707). */
export function mcpResource(): string {
  return `${oauthIssuer()}${routePath(mcpConfig.ROUTE_PREFIX)}`;
}

/** The URL of the protected resource metadata of the MCP endpoint (RFC 9728). */
export function resourceMetadataUrl(): string {
  return `${oauthIssuer()}/.well-known/oauth-protected-resource${routePath(mcpConfig.ROUTE_PREFIX)}`;
}

/** The protected resource metadata of the MCP endpoint (RFC 9728). */
export function resourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [oauthIssuer()],
    bearer_methods_supported: ['header'],
    resource_name: mcpConfig.SERVER_NAME ?? appConfig.NAME
  };
}

/** The metadata of the authorization server (RFC 8414). */
export function authorizationServerMetadata() {
  const base = `${oauthIssuer()}${routePath(mcpOAuth2Config.ROUTE_PREFIX)}`;
  return {
    issuer: oauthIssuer(),
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true
  };
}

/**
 * Checks a redirect URI of a client: an HTTPS URL, or an HTTP one of the loopback interface, without a fragment.
 *
 * @param {string} uri - The redirect URI.
 * @return {boolean} Whether it is allowed.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) {
    return false;
  }
  if (url.protocol === 'https:') {
    return true;
  }
  return (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}

/**
 * Registers a client without storing it: its ID holds its redirect URIs and name, signed with the JWT secret, or with
 * the private key of the JWTs.
 *
 * @param {OAuthClient} client - The client.
 * @return {Promise<string>} The client ID.
 */
export async function createClientId(client: OAuthClient): Promise<string> {
  const payload = Buffer.from(
    JSON.stringify({
      r: client.redirectUris,
      t: client.issuedAt,
      n: client.name
    })
  ).toString('base64url');
  return `mcp_${payload}.${await sign(payload)}`;
}

/**
 * Reads a client of {@link createClientId}.
 *
 * @param {unknown} clientId - The client ID.
 * @return {Promise<OAuthClient | undefined>} The client, undefined for an ID not signed by the application.
 */
export async function readClientId(
  clientId: unknown
): Promise<OAuthClient | undefined> {
  const match =
    typeof clientId === 'string' &&
    /^mcp_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(clientId);
  if (!match) {
    return undefined;
  }
  const expected = Buffer.from(await sign(match[1]));
  const actual = Buffer.from(match[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return undefined;
  }
  // Signed by the application, so its own JSON
  const { r, t, n } = JSON.parse(Buffer.from(match[1], 'base64url').toString());
  return { redirectUris: r, issuedAt: t, name: n };
}

/**
 * Checks a PKCE code verifier against the `S256` challenge of the authorization request (RFC 7636).
 *
 * @param {string} verifier - The code verifier of the token request.
 * @param {string} challenge - The code challenge of the authorization request.
 * @return {boolean} Whether they match.
 */
export function verifyCodeChallenge(
  verifier: unknown,
  challenge: string
): boolean {
  if (
    typeof verifier !== 'string' ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
  ) {
    return false;
  }
  const expected = Buffer.from(
    createHash('sha256').update(verifier).digest('base64url')
  );
  const actual = Buffer.from(challenge);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function sign(payload: string): Promise<string> {
  return createHmac('sha256', await signingKey())
    .update(payload)
    .digest('base64url');
}

async function signingKey(): Promise<Buffer> {
  const source = jwtConfig.SECRET
    ? `secret:${jwtConfig.SECRET}`
    : `file:${path.resolve(jwtConfig.PRIVATE_KEY_PATH)}`;
  let key = keys.get(source);
  if (!key) {
    const secret =
      jwtConfig.SECRET ??
      (await fsp.readFile(path.resolve(jwtConfig.PRIVATE_KEY_PATH)));
    key = createHash('sha256')
      .update('appweaver.mcp.oauth2.client\0')
      .update(secret)
      .digest();
    keys.set(source, key);
  }
  return key;
}
