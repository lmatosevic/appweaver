import { FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import {
  AuthScope,
  AuthSource,
  createLogger,
  ErrorCode,
  isAppweaverError,
  ROUTE,
  SecurityStore,
  TwoFactorChallengeMethod
} from '@appweaver/common';
import { define, inject, LocaleService } from '@appweaver/core';
import {
  AuthService,
  AuthTokens,
  authRouteCaptcha,
  checkLoginRateLimit,
  JwtPayload,
  Server,
  TwoFactorService
} from '@appweaver/web';
import {
  CaptchaAuthRoute,
  oauth2Config,
  securityConfig
} from '@appweaver/web/config';
import { mcpConfig, mcpOAuth2Config } from '../config';
import {
  authorizationServerMetadata,
  createClientId,
  isAllowedRedirectUri,
  mcpResource,
  oauthIssuer,
  readClientId,
  resourceMetadata,
  routePath,
  verifyCodeChallenge
} from '../oauth/oauth-util';
import { requestLocale, sendPage, translate } from './oauth-pages';

const logger = createLogger('mcp');

/** The one-time token of an authorization request waiting for its user to sign in. */
const AUTHORIZATION_PURPOSE = 'mcpAuthorization';
/** The one-time token of an authorization code. */
const CODE_PURPOSE = 'mcpAuthorizationCode';
/** The one-time token of the password form, the password or the 2FA step of a sign-in, the state of its form. */
const SIGN_IN_PURPOSE = 'mcpSignIn';
/** The challenge method of the recovery codes. */
const RECOVERY = 'Recovery';
/** The errors of a method the user cannot use, leaving the current challenge in place. */
const RETRY_CODES = new Set<string>([
  ErrorCode.Account2FAMethodUnavailable,
  ErrorCode.Account2FAMethodNotEnabled,
  ErrorCode.AccountPhoneNotVerified
]);
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

/** The password form of the sign-in page, or the password or the 2FA step of a sign-in. */
type SignInState = {
  request: AuthorizationRequest;
  step: 'login' | 'password' | 'twoFactor';
  /** The name of the client, shown again with the error of the password form */
  client?: string;
  /** The token of the provider sign-in, exchanged with the password */
  token?: string;
  authUserId?: string | number;
  authSource?: AuthSource;
  challengeId?: string;
  method?: TwoFactorChallengeMethod;
  destination?: string | null;
  methods?: TwoFactorChallengeMethod[];
};

type Query = Record<string, string | undefined>;

/** An error of the OAuth endpoints, answered as `{ error, error_description }` (RFC 6749). */
class OAuthError extends Error {
  constructor(
    public readonly error: string,
    description: string
  ) {
    super(description);
  }
}

/** The JWTs of the server, decorated by the auth plugin of web. */
type Jwt = {
  verify: <T>(token: string) => T;
  decode: <T>(token: string) => T | null;
};

/**
 * Registers the OAuth 2.1 authorization server of the MCP clients with `mcp.oauth2.enabled`: the protected resource
 * metadata of the MCP endpoint (RFC 9728), the authorization server metadata (RFC 8414), the dynamic client
 * registration (RFC 7591), and the authorization code flow with PKCE, signing the user in with an OAuth2 provider of
 * `security.oauth2` or their password (`mcp.oauth2.passwordEnabled`) and issuing the JWTs of `AuthService`.
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
    const route = (
      method: 'GET' | 'POST',
      url: string,
      handler: (request: FastifyRequest, reply: FastifyReply) => unknown,
      rateLimit?: { max: number; secure?: boolean }
    ) =>
      server.route({
        method,
        url,
        handler,
        schema: { hide: true },
        ...(rateLimit ? { config: { rateLimit } } : {})
      } as RouteOptions);

    route('GET', '/.well-known/oauth-protected-resource', resourceMetadata);
    route(
      'GET',
      `/.well-known/oauth-protected-resource${routePath(mcpConfig.ROUTE_PREFIX)}`,
      resourceMetadata
    );
    route(
      'GET',
      '/.well-known/oauth-authorization-server',
      authorizationServerMetadata
    );
    route(
      'POST',
      `${prefix}/register`,
      (request, reply) => oauthReply(reply, () => register(request, reply)),
      { max: 12 }
    );
    route('GET', `${prefix}/authorize`, (request, reply) =>
      authorize(server, request, reply)
    );
    route('GET', `${prefix}/callback`, callback);
    if (mcpOAuth2Config.FORMS_ENABLED) {
      // Failing while the rate limiter fails, since it takes passwords and 2FA codes
      route('POST', `${prefix}/sign-in`, signInStep, {
        max: 12,
        secure: true
      });
    }
    route(
      'POST',
      `${prefix}/token`,
      (request, reply) =>
        oauthReply(reply, () => token(server, request.body as Query, reply)),
      { max: 30 }
    );
  };
  if (mcpOAuth2Config.PASSWORD_ENABLED && !passwordSignIn()) {
    logger.warn(
      'The password sign-in of the MCP clients needs mcp.oauth2.formsEnabled, and no bot check on the login'
    );
  }
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

/** Checks an authorization request, then asks the user to sign in with an OAuth2 provider or their password. */
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
    const locale = requestLocale(request);
    return sendPage(
      reply,
      'error',
      { message: translate('mcp.error.invalid', locale) },
      locale,
      400
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
  if (!signInProviders(server).length && !passwordSignIn()) {
    logger.warn(
      'No OAuth2 provider of security.oauth2 nor the password sign-in to sign the MCP users in'
    );
    return fail('temporarily_unavailable', 'No sign-in provider is enabled');
  }
  // Always asked, so a link of a registered client never signs the user in unseen
  return sendSignIn(
    request,
    reply,
    {
      clientId: query.client_id!,
      redirectUri,
      codeChallenge: query.code_challenge,
      state: query.state
    },
    client.name
  );
}

/**
 * Asks the user to sign in for a client, with the links of the OAuth2 providers and the password form, each with the
 * single-use token of the authorization request.
 */
async function sendSignIn(
  request: FastifyRequest,
  reply: FastifyReply,
  pending: AuthorizationRequest,
  client?: string,
  error?: string,
  status: number = 200
) {
  const store = inject(SecurityStore);
  const locale = requestLocale(request);
  const prefix = routePath(mcpOAuth2Config.ROUTE_PREFIX);
  const providers = signInProviders(request.server);
  let callbackUrl = '';
  if (providers.length) {
    const token = await store.generateOneTimeToken(
      AUTHORIZATION_PURPOSE,
      pending,
      oauth2Config.STATE_TTL
    );
    callbackUrl = `${oauthIssuer()}${prefix}/callback?request=${encodeURIComponent(token)}`;
  }
  const loginUrl = (provider: string) =>
    `${routePath(securityConfig.ROUTE_PREFIX)}/login/${provider}?redirectToUrl=${encodeURIComponent(callbackUrl)}`;
  const form = passwordSignIn()
    ? {
        action: `${prefix}/sign-in`,
        state: await store.generateOneTimeToken(
          SIGN_IN_PURPOSE,
          { request: pending, step: 'login', client } satisfies SignInState,
          oauth2Config.STATE_TTL
        )
      }
    : {};

  return sendPage(
    reply,
    'sign-in',
    {
      client: client ?? translate('mcp.signIn.client', locale),
      host: new URL(pending.redirectUri).host,
      providers: providers.map((name) => {
        const key = `mcp.signIn.providers.${name}`;
        const label = inject(LocaleService).hasTranslation(key, locale)
          ? translate(key, locale)
          : name;
        return { name, label, url: loginUrl(name) };
      }),
      ...form,
      error
    },
    locale,
    status
  );
}

/** Signs in a user back from a provider, asking for the password of an account to link first. */
async function callback(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Query;
  const locale = requestLocale(request);
  let pending: AuthorizationRequest;
  try {
    pending = await inject(SecurityStore).useOneTimeToken<AuthorizationRequest>(
      query.request ?? '',
      AUTHORIZATION_PURPOSE
    );
  } catch {
    return sendExpired(reply, locale);
  }
  // Without the forms, the exchange refuses a password it needs
  if (query.passwordRequired === 'true' && mcpOAuth2Config.FORMS_ENABLED) {
    return sendStep(reply, locale, {
      request: pending,
      step: 'password',
      token: query.token ?? ''
    });
  }
  return signIn(request, reply, pending, () =>
    inject(AuthService).exchangeToken(query.token ?? '')
  );
}

/** Completes the password or the 2FA step of a sign-in. */
async function signInStep(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as Query;
  const locale = requestLocale(request);
  let state: SignInState;
  try {
    state = await inject(SecurityStore).useOneTimeToken<SignInState>(
      body.state ?? '',
      SIGN_IN_PURPOSE
    );
  } catch {
    return sendExpired(reply, locale);
  }
  if (state.step === 'login') {
    return passwordLogin(request, reply, state, body);
  }
  if (state.step === 'password') {
    // A wrong password uses the token up, so the user starts again
    return signIn(request, reply, state.request, () =>
      inject(AuthService).exchangeToken(state.token!, body.password ?? '')
    );
  }

  const authUser = await inject(AuthService).findById(state.authUserId!);
  if (!authUser?.enabled) {
    return deny(reply, state.request, 'The user does not exist or is disabled');
  }
  try {
    if (body.action === 'resend') {
      const method = body.method as TwoFactorChallengeMethod | undefined;
      return await sendChallenge(reply, locale, state, method);
    }
    const { token } = await inject(TwoFactorService).verifyChallenge(
      authUser,
      state.challengeId!,
      body.code ?? ''
    );
    return await signIn(request, reply, state.request, () =>
      inject(AuthService).exchangeToken(token)
    );
  } catch (e) {
    if (!isAppweaverError(e)) {
      throw e;
    }
    // A wrong code keeps the challenge for another try, a method the user cannot use keeps the current one
    if (e.code === (ErrorCode.Account2FACodeInvalid as string)) {
      return sendStep(
        reply,
        locale,
        state,
        translate('mcp.twoFactor.invalid', locale)
      );
    }
    if (RETRY_CODES.has(e.code)) {
      return sendStep(reply, locale, state, e.message);
    }
    return deny(reply, state.request, e.message);
  }
}

/**
 * Signs a user in with the password form of the sign-in page, counted with the logins of the API. A wrong password,
 * or too many sign-ins, shows the page again with a new state.
 */
async function passwordLogin(
  request: FastifyRequest,
  reply: FastifyReply,
  state: SignInState,
  body: Query
) {
  const locale = requestLocale(request);
  if (!passwordSignIn()) {
    return sendExpired(reply, locale);
  }
  let tokens: AuthTokens;
  try {
    await checkLoginRateLimit(request);
    tokens = await inject(AuthService).login(
      body.username ?? '',
      body.password ?? ''
    );
  } catch (e) {
    if (!isAppweaverError(e)) {
      throw e;
    }
    const again = (key: string, status: number) => {
      const retryAfter = (e.details as { retryAfter?: number } | undefined)
        ?.retryAfter;
      if (retryAfter) {
        reply.header('retry-after', retryAfter);
      }
      return sendSignIn(
        request,
        reply,
        state.request,
        state.client,
        translate(key, locale),
        status
      );
    };
    switch (e.code as ErrorCode) {
      case ErrorCode.AuthInvalidCredentials:
        return again('mcp.signIn.invalid', 401);
      case ErrorCode.RateLimited:
        return again('mcp.signIn.rateLimited', 429);
      case ErrorCode.MemoryUnavailable:
        return again('mcp.signIn.unavailable', 503);
      default:
        return deny(reply, state.request, e.message);
    }
  }
  return signIn(request, reply, state.request, async () => tokens);
}

/**
 * Signs the user in with the tokens of an exchange, starting the 2FA challenge of a user who must pass it, otherwise
 * redirecting back to the client with an authorization code.
 */
async function signIn(
  request: FastifyRequest,
  reply: FastifyReply,
  pending: AuthorizationRequest,
  exchange: () => Promise<AuthTokens>
) {
  let payload: JwtPayload;
  try {
    // Signs the user in like the OAuth2 login, linking the provider account
    payload = jwt(request.server).decode<JwtPayload>(
      (await exchange()).accessToken
    )!;
  } catch (e) {
    if (!isAppweaverError(e)) {
      logger.error({ err: e }, 'MCP OAuth sign-in failed');
    }
    return deny(
      reply,
      pending,
      isAppweaverError(e) ? e.message : 'The sign-in failed'
    );
  }
  if (payload.scope === AuthScope.TwoFA) {
    if (!mcpOAuth2Config.FORMS_ENABLED) {
      return deny(
        reply,
        pending,
        'The user must pass the two-factor authentication'
      );
    }
    return sendChallenge(reply, requestLocale(request), {
      request: pending,
      step: 'twoFactor',
      authUserId: payload.sub,
      authSource: payload.source
    });
  }
  const code = await inject(SecurityStore).generateOneTimeToken(
    CODE_PURPOSE,
    {
      ...pending,
      authUserId: payload.sub,
      authSource: payload.source
    } satisfies AuthorizationCode,
    securityConfig.AUTH_OTT_TTL
  );
  return redirectWith(reply, pending.redirectUri, {
    code,
    state: pending.state
  });
}

/** Sends a 2FA challenge of the method, the default one of the user without, and asks for its code. */
async function sendChallenge(
  reply: FastifyReply,
  locale: string | undefined,
  state: SignInState,
  method?: TwoFactorChallengeMethod
) {
  const authUser = (await inject(AuthService).findById(state.authUserId!))!;
  const challenge = await inject(TwoFactorService).sendChallenge(authUser, {
    method,
    authSource: state.authSource,
    locale
  });
  return sendStep(reply, locale, {
    ...state,
    challengeId: challenge.challengeId,
    method: challenge.method,
    destination: challenge.destination,
    methods: [...challenge.methods, RECOVERY]
  });
}

/** Asks for the password or the 2FA code of a step, its state kept for the single use of the form. */
async function sendStep(
  reply: FastifyReply,
  locale: string | undefined,
  state: SignInState,
  error?: string
) {
  const token = await inject(SecurityStore).generateOneTimeToken(
    SIGN_IN_PURPOSE,
    state,
    oauth2Config.STATE_TTL
  );
  const action = `${routePath(mcpOAuth2Config.ROUTE_PREFIX)}/sign-in`;
  if (state.step === 'password') {
    return sendPage(reply, 'password', { action, state: token, error }, locale);
  }
  const hint =
    state.method === RECOVERY
      ? translate('mcp.twoFactor.recovery', locale)
      : state.destination
        ? translate('mcp.twoFactor.sent', locale, {
            destination: state.destination
          })
        : translate('mcp.twoFactor.app', locale);
  return sendPage(
    reply,
    'two-factor',
    {
      action,
      state: token,
      error,
      hint,
      methods: state.methods!.map((value) => ({
        value,
        label: translate(`mcp.twoFactor.methods.${value}`, locale),
        selected: value === state.method
      }))
    },
    locale
  );
}

function sendExpired(reply: FastifyReply, locale?: string) {
  return sendPage(
    reply,
    'error',
    { message: translate('mcp.error.expired', locale) },
    locale,
    400
  );
}

function deny(
  reply: FastifyReply,
  pending: AuthorizationRequest,
  description: string
) {
  return redirectWith(reply, pending.redirectUri, {
    error: 'access_denied',
    error_description: description,
    state: pending.state
  });
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

/** Whether the sign-in page offers the password form: it posts to the forms, and the login requires no bot check. */
function passwordSignIn(): boolean {
  const captcha = authRouteCaptcha(CaptchaAuthRoute.Login);
  return (
    mcpOAuth2Config.PASSWORD_ENABLED &&
    mcpOAuth2Config.FORMS_ENABLED &&
    !captcha.recaptchaAction &&
    !captcha.turnstileAction
  );
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
      .code(400)
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
