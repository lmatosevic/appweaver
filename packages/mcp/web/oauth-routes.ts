import { FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthScope,
  AuthSource,
  createLogger,
  isAppweaverError,
  ROUTE,
  SecurityStore
} from '@appweaver/common';
import { define, inject } from '@appweaver/core';
import { AuthService, JwtPayload, Server } from '@appweaver/web';
import { oauth2Config, securityConfig } from '@appweaver/web/config';
import { mcpOAuth2Config } from '../config';
import {
  authorizationServerMetadata,
  createClientId,
  isAllowedRedirectUri,
  mcpResource,
  OAuthError,
  oauthIssuer,
  readClientId,
  resourceMetadata,
  routePath,
  verifyCodeChallenge
} from '../oauth/oauth-util';

const logger = createLogger('mcp');

/** The one-time token of an authorization request waiting for its user to sign in. */
const AUTHORIZATION_PURPOSE = 'mcpAuthorization';
/** The one-time token of an authorization code. */
const CODE_PURPOSE = 'mcpAuthorizationCode';
const MAX_REDIRECT_URIS = 10;

/** An authorization request of a client. */
type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
};

/** The user an authorization code was issued to, for the request it answers. */
type AuthorizationCode = AuthorizationRequest & {
  authUserId: string | number;
  authSource: AuthSource;
};

type Query = Record<string, string | undefined>;

/** The JWTs of the server, decorated by the auth plugin of web. */
type Jwt = {
  verify: <T>(token: string) => T;
  decode: <T>(token: string) => T | null;
};

/**
 * Registers the OAuth 2.1 authorization server of the MCP clients with `mcp.oauth2.enabled`: the protected resource
 * metadata of the MCP endpoint (RFC 9728), the authorization server metadata (RFC 8414), the dynamic client
 * registration (RFC 7591), and the authorization code flow with PKCE, signing the user in with an OAuth2 provider of
 * `security.oauth2` and issuing the JWTs of `AuthService`.
 */
export function registerOAuthRoutes(): void {
  if (!mcpOAuth2Config.ENABLED) {
    return;
  }
  const routes = async (server: Server) => {
    // The token endpoint takes a form body (RFC 6749), parsed in this scope only
    if (!server.hasContentTypeParser('application/x-www-form-urlencoded')) {
      server.addContentTypeParser(
        'application/x-www-form-urlencoded',
        { parseAs: 'string' },
        (_, body: string, done) =>
          done(null, Object.fromEntries(new URLSearchParams(body)))
      );
    }
    const prefix = routePath(mcpOAuth2Config.ROUTE_PREFIX);
    // The protocol endpoints stay out of the OpenAPI document
    const hide = { schema: { hide: true } } as never;

    const sendResourceMetadata = async () => resourceMetadata();
    server.get(
      '/.well-known/oauth-protected-resource',
      hide,
      sendResourceMetadata
    );
    server.get(
      `/.well-known/oauth-protected-resource${new URL(mcpResource()).pathname}`,
      hide,
      sendResourceMetadata
    );
    server.get('/.well-known/oauth-authorization-server', hide, async () =>
      authorizationServerMetadata()
    );
    server.post(
      `${prefix}/register`,
      { schema: { hide: true }, config: { rateLimit: { max: 12 } } } as never,
      (request, reply) => oauthReply(reply, () => register(request, reply))
    );
    server.get(`${prefix}/authorize`, hide, (request, reply) =>
      authorize(server, request, reply)
    );
    server.get(`${prefix}/callback`, hide, (request, reply) =>
      callback(request, reply)
    );
    server.post(
      `${prefix}/token`,
      { schema: { hide: true }, config: { rateLimit: { max: 30 } } } as never,
      (request, reply) =>
        oauthReply(reply, () => token(server, request.body as Query, reply))
    );
  };
  define(Object.assign(routes, { apiPrefix: false }), ROUTE, 'append');
}

/** Registers a public client, its ID holding its redirect URIs. */
async function register(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as {
    redirect_uris?: unknown;
    client_name?: unknown;
  };
  const uris = body.redirect_uris;
  if (
    !Array.isArray(uris) ||
    !uris.length ||
    uris.length > MAX_REDIRECT_URIS ||
    !uris.every((uri) => typeof uri === 'string' && isAllowedRedirectUri(uri))
  ) {
    throw new OAuthError(
      'invalid_redirect_uri',
      `Between 1 and ${MAX_REDIRECT_URIS} redirect URIs, of HTTPS or of the loopback interface`
    );
  }
  const name =
    typeof body.client_name === 'string'
      ? body.client_name.slice(0, 100)
      : undefined;
  const issuedAt = Math.floor(Date.now() / 1000);
  const clientId = await createClientId({
    redirectUris: uris,
    issuedAt,
    name
  });
  logger.info({ client: name }, 'MCP OAuth client registered');
  return reply.code(201).send({
    client_id: clientId,
    client_id_issued_at: issuedAt,
    redirect_uris: uris,
    ...(name ? { client_name: name } : {}),
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none'
  });
}

/** Checks an authorization request, then sends the user to sign in with an OAuth2 provider. */
async function authorize(
  server: Server,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const query = request.query as Query;
  const client = await readClientId(query.client_id);
  const redirectUri = query.redirect_uri;
  // Without a known client and redirect URI, the error is never redirected
  if (!client || !redirectUri || !client.redirectUris.includes(redirectUri)) {
    return sendPage(
      reply,
      400,
      'Invalid authorization request',
      'The client is unknown, or its redirect URI is not registered.'
    );
  }
  const fail = (error: string, description: string) =>
    redirectWith(reply, redirectUri, {
      error,
      error_description: description,
      state: query.state
    });
  if (query.response_type !== 'code') {
    return fail('unsupported_response_type', 'Only the code flow is supported');
  }
  if (!query.code_challenge || query.code_challenge_method !== 'S256') {
    return fail('invalid_request', 'A PKCE code challenge of S256 is required');
  }
  if (query.resource && query.resource !== mcpResource()) {
    return fail('invalid_target', `The resource is not ${mcpResource()}`);
  }
  const providers = signInProviders(server);
  if (!providers.length) {
    logger.warn(
      'No OAuth2 provider of security.oauth2 to sign the MCP users in'
    );
    return fail('temporarily_unavailable', 'No sign-in provider is enabled');
  }

  const pending = await inject(SecurityStore).generateOneTimeToken(
    AUTHORIZATION_PURPOSE,
    {
      clientId: query.client_id!,
      redirectUri,
      codeChallenge: query.code_challenge,
      state: query.state
    } satisfies AuthorizationRequest,
    oauth2Config.STATE_TTL
  );
  const callbackUrl = `${oauthIssuer()}${routePath(mcpOAuth2Config.ROUTE_PREFIX)}/callback?request=${encodeURIComponent(pending)}`;
  const loginUrl = (provider: string) =>
    `${routePath(securityConfig.ROUTE_PREFIX)}/login/${provider}?redirectToUrl=${encodeURIComponent(callbackUrl)}`;

  if (providers.length === 1) {
    return reply.redirect(loginUrl(providers[0]));
  }
  const links = providers
    .map(
      (provider) =>
        `<li><a href="${escapeHtml(loginUrl(provider))}">${escapeHtml(provider)}</a></li>`
    )
    .join('');
  return sendPage(
    reply,
    200,
    'Sign in',
    `${client.name ?? 'An MCP client'} asks to act as you. Sign in with:`,
    `<ul>${links}</ul>`
  );
}

/** Issues the authorization code of a user signed in by a provider, redirecting back to the client. */
async function callback(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Query;
  const securityStore = inject(SecurityStore);
  let pending: AuthorizationRequest;
  try {
    pending = await securityStore.useOneTimeToken<AuthorizationRequest>(
      query.request ?? '',
      AUTHORIZATION_PURPOSE
    );
  } catch {
    return sendPage(
      reply,
      400,
      'Authorization expired',
      'The authorization request is unknown or expired, start again from the client.'
    );
  }
  const back = (params: Query) =>
    redirectWith(reply, pending.redirectUri, {
      ...params,
      state: pending.state
    });

  let payload: JwtPayload;
  try {
    // Signs the user in like the OAuth2 login, linking the provider account
    const tokens = await inject(AuthService).exchangeToken(query.token ?? '');
    payload = jwt(request.server).decode<JwtPayload>(tokens.accessToken)!;
  } catch (e) {
    if (!isAppweaverError(e)) {
      logger.error({ err: e }, 'MCP OAuth sign-in failed');
    }
    return back({
      error: 'access_denied',
      error_description: isAppweaverError(e) ? e.message : 'The sign-in failed'
    });
  }
  if (payload.scope !== AuthScope.Auth) {
    return back({
      error: 'access_denied',
      error_description: 'The user must pass the two-factor authentication'
    });
  }
  const code = await securityStore.generateOneTimeToken(
    CODE_PURPOSE,
    {
      ...pending,
      authUserId: payload.sub,
      authSource: payload.source
    } satisfies AuthorizationCode,
    securityConfig.AUTH_OTT_TTL
  );
  return back({ code });
}

/** Exchanges an authorization code or a refresh token for the tokens of the user. */
async function token(server: Server, body: Query = {}, reply: FastifyReply) {
  const authService = inject(AuthService);
  let authUser;
  let authSource: AuthSource;

  if (body.grant_type === 'authorization_code') {
    let code: AuthorizationCode;
    try {
      code = await inject(SecurityStore).useOneTimeToken<AuthorizationCode>(
        body.code ?? '',
        CODE_PURPOSE
      );
    } catch {
      throw new OAuthError('invalid_grant', 'Unknown or expired code');
    }
    if (
      code.clientId !== body.client_id ||
      code.redirectUri !== body.redirect_uri ||
      !verifyCodeChallenge(body.code_verifier, code.codeChallenge)
    ) {
      throw new OAuthError(
        'invalid_grant',
        'The client, the redirect URI or the code verifier does not match'
      );
    }
    authUser = await authService.findById(code.authUserId);
    authSource = code.authSource;
  } else if (body.grant_type === 'refresh_token') {
    let payload: JwtPayload;
    try {
      payload = jwt(server).verify<JwtPayload>(body.refresh_token ?? '');
    } catch {
      throw new OAuthError('invalid_grant', 'Invalid or expired refresh token');
    }
    if (payload.scope !== AuthScope.Refresh) {
      throw new OAuthError('invalid_grant', 'Not a refresh token');
    }
    authUser = await authService.findById(payload.sub);
    try {
      // Rejects a disabled user, and a token issued before their logout
      authService.authorize(
        authUser,
        `${routePath(securityConfig.ROUTE_PREFIX)}/refresh`,
        {},
        payload
      );
    } catch {
      throw new OAuthError('invalid_grant', 'The refresh token was revoked');
    }
    authSource = payload.source;
  } else {
    throw new OAuthError(
      'unsupported_grant_type',
      'Only the authorization_code and refresh_token grants are supported'
    );
  }

  if (!authUser?.enabled) {
    throw new OAuthError(
      'invalid_grant',
      'The user does not exist or is disabled'
    );
  }
  const tokens = await authService.generateAuthTokens(
    authUser,
    AuthScope.Auth,
    authSource
  );
  return reply.header('cache-control', 'no-store').send({
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken
  });
}

function jwt(server: unknown): Jwt {
  return (server as { jwt: Jwt }).jwt;
}

/** The enabled OAuth2 providers the users may sign in with, by name. */
function signInProviders(server: Server): string[] {
  const allowed = mcpOAuth2Config.PROVIDERS.map((name) => name.toLowerCase());
  return Object.values(AuthSource)
    .filter(
      (source) =>
        source.startsWith('oauth2') &&
        (server as unknown as Record<string, unknown>)[source] !== undefined
    )
    .map((source) => source.replace('oauth2', '').toLowerCase())
    .filter((name) => !allowed.length || allowed.includes(name));
}

/** Answers the error of an OAuth endpoint as `{ error, error_description }`. */
async function oauthReply(reply: FastifyReply, fn: () => Promise<unknown>) {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof OAuthError)) {
      throw e;
    }
    return reply
      .code(e.status)
      .header('cache-control', 'no-store')
      .send({ error: e.error, error_description: e.message });
  }
}

function redirectWith(reply: FastifyReply, uri: string, params: Query) {
  const url = new URL(uri);
  for (const [key, value] of Object.entries({
    ...params,
    iss: oauthIssuer()
  })) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return reply.redirect(url.toString());
}

function sendPage(
  reply: FastifyReply,
  status: number,
  title: string,
  message: string,
  html = ''
) {
  return reply
    .code(status)
    .type('text/html; charset=utf-8')
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
        `<title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>` +
        `<p>${escapeHtml(message)}</p>${html}</body></html>`
    );
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!
  );
}
