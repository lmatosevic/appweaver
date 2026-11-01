import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const securityConfig = defineConfig('security', {
  /** Base path for authentication routes. Default: `'/auth'`. */
  ROUTE_PREFIX: Type.String({ default: '/auth' }),
  /** Security cache TTL in milliseconds. Default: `300000` (5 min). */
  CACHE_TTL: Type.Integer({ default: 300000 }),
  /** One-time token TTL for authentication in milliseconds. Default: `120000` (2 min). */
  AUTH_OTT_TTL: Type.Integer({ default: 120000 }),
  /** Allowed hosts for post-authentication redirects. Default: `['*']`. */
  ALLOWED_REDIRECT_HOSTS: Type.Array(Type.String(), {
    default: ['*']
  })
});

export const accountConfig = defineConfig('security.account', {
  /** Base path for account management routes. Default: `'/auth/account'`. */
  ROUTE_PREFIX: Type.String({ default: '/auth/account' }),
  /** Enable email verification flow. Default: `true`. */
  VERIFY_EMAIL_ENABLED: Type.Boolean({ default: true }),
  /** Email verification token TTL in milliseconds. Default: `7200000` (2 hours). */
  VERIFY_EMAIL_OTT_TTL: Type.Integer({ default: 7200000 }),
  /** Enable password reset flow. Default: `true`. */
  RESET_PASSWORD_ENABLED: Type.Boolean({ default: true }),
  /** Password reset token TTL in milliseconds. Default: `1800000` (30 min). */
  RESET_PASSWORD_OTT_TTL: Type.Integer({ default: 1800000 })
});

export const twoFactorConfig = defineConfig('security.account.2fa', {
  /** Enable two-factor authentication. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Force 2FA for all users. Default: `false`. */
  FORCED: Type.Boolean({ default: false }),
  /** 2FA verification code TTL in milliseconds. Default: `300000` (5 min). */
  OTT_TTL: Type.Integer({ default: 300000 })
});

export const recaptchaConfig = defineConfig('security.recaptcha', {
  /** Enable Google reCAPTCHA verification. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Google reCAPTCHA secret key. */
  SECRET: Type.Optional(Type.String()),
  /** Request the header name for the reCAPTCHA token. Default: `'x-recaptcha-token'`. */
  HEADER_NAME: Type.String({ default: 'x-recaptcha-token' }),
  /** Minimum reCAPTCHA v3 score threshold (0–1). Default: `0.4`. */
  MIN_SCORE: Type.Number({ default: 0.4 }),
  /** Google reCAPTCHA verification endpoint URL. Default: `'https://www.google.com/recaptcha/api/siteverify'`. */
  VERIFY_URL: Type.String({
    default: 'https://www.google.com/recaptcha/api/siteverify'
  })
});

export const turnstileConfig = defineConfig('security.turnstile', {
  /** Enable Cloudflare Turnstile verification. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Cloudflare Turnstile secret key. */
  SECRET: Type.Optional(Type.String()),
  /** Request header name for the Turnstile token. Default: `'x-turnstile-token'`. */
  HEADER_NAME: Type.String({ default: 'x-turnstile-token' }),
  /** Cloudflare Turnstile verification endpoint URL. Default: `'https://challenges.cloudflare.com/turnstile/v0/siteverify'`. */
  VERIFY_URL: Type.String({
    default: 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
  })
});

export const basicAuthConfig = defineConfig('security.basic', {
  /** Enable HTTP Basic authentication. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** HTTP Basic auth realm name. */
  REALM: Type.Optional(Type.String()),
  /** Enable proxy mode for Basic auth. Default: `false`. */
  PROXY_MODE: Type.Boolean({ default: false })
});

export const jwtConfig = defineConfig('security.jwt', {
  /** HMAC secret for symmetric JWT signing (HS256). If set, RSA keys are not used. */
  SECRET: Type.Optional(Type.String()),
  /** Path to an RSA public key for JWT verification (RS256). Default: `'./storage/__keys__/public.key'`. */
  PUBLIC_KEY_PATH: Type.String({
    default: './storage/__keys__/public.key'
  }),
  /** Path to an RSA private key for JWT signing (RS256). Default: `'./storage/__keys__/private.key'`. */
  PRIVATE_KEY_PATH: Type.String({
    default: './storage/__keys__/private.key'
  }),
  /** Auto-generate RSA 2048-bit key pair if missing. Default: `true`. */
  AUTO_GENERATE_KEYS: Type.Boolean({ default: true }),
  /** Access token expiration in seconds. Default: `604800` (7 days). */
  EXPIRES_IN: Type.Integer({ default: 604800 }),
  /** Refresh token expiration in seconds. Default: `5184000` (60 days). */
  REFRESH_EXPIRES_IN: Type.Integer({ default: 5184000 })
});

export const oauth2Config = defineConfig('security.oauth2', {
  /** OAuth2 state parameter TTL in milliseconds. Default: `600000` (10 min). */
  STATE_TTL: Type.Integer({ default: 600000 }),
  /** Allow registering new users via OAuth2 login. When `false`, only already existing users (matched by email) can
   * log in via OAuth2. Default: `true`. */
  REGISTRATION_ENABLED: Type.Boolean({ default: true }),
  /** Download the user's avatar image from the OAuth2 provider during registration and pass it as `avatarFile` to the
   * `registrationData` and `registrationFiles` callbacks. When disabled, only `avatarUrl` is passed on and
   * `avatarFile` stays `undefined`. Default: `true`. */
  FETCH_AVATAR_ENABLED: Type.Boolean({ default: true })
});

export const oauth2GoogleConfig = defineConfig('security.oauth2.google', {
  /** Enable Google OAuth2 provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Google OAuth2 client ID. */
  CLIENT_ID: Type.Optional(Type.String()),
  /** Google OAuth2 client secret. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** Google user info endpoint. Default: `'https://www.googleapis.com/oauth2/v2/userinfo'`. */
  USER_INFO_URL: Type.String({
    default: 'https://www.googleapis.com/oauth2/v2/userinfo'
  }),
  /** Extra query parameters of the Google authorization request, i.e. `{ "prompt": "select_account" }`.
   * Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});

export const oauth2FacebookConfig = defineConfig('security.oauth2.facebook', {
  /** Enable Facebook OAuth2 provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Facebook OAuth2 client ID. */
  CLIENT_ID: Type.Optional(Type.String()),
  /** Facebook OAuth2 client secret. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** Facebook user info endpoint. Default: `'https://graph.facebook.com/me'`. */
  USER_INFO_URL: Type.String({
    default: 'https://graph.facebook.com/me'
  }),
  /** Extra query parameters of the Facebook authorization request, i.e. `{ "auth_type": "reauthenticate" }`.
   * Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});

export const oauth2XConfig = defineConfig('security.oauth2.x', {
  /** Enable X (Twitter) OAuth2 provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** X OAuth2 client ID. */
  CLIENT_ID: Type.Optional(Type.String()),
  /** X OAuth2 client secret. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** X user info endpoint. Default: `'https://api.x.com/2/users/me'`. */
  USER_INFO_URL: Type.String({
    default: 'https://api.x.com/2/users/me'
  }),
  /** Extra query parameters of the X authorization request. Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});

export const oauth2GithubConfig = defineConfig('security.oauth2.github', {
  /** Enable GitHub OAuth2 provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** GitHub OAuth2 client ID. */
  CLIENT_ID: Type.Optional(Type.String()),
  /** GitHub OAuth2 client secret. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** GitHub user info endpoint. Default: `'https://api.github.com/user'`. */
  USER_INFO_URL: Type.String({
    default: 'https://api.github.com/user'
  }),
  /** Extra query parameters of the GitHub authorization request, i.e. `{ "prompt": "select_account" }`.
   * Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});

export const oauth2GitlabConfig = defineConfig('security.oauth2.gitlab', {
  /** Enable GitLab OAuth2 provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** GitLab OAuth2 client ID. */
  CLIENT_ID: Type.Optional(Type.String()),
  /** GitLab OAuth2 client secret. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** GitLab instance base URL, used for the authorize and token endpoints. Set it to your own host when using a
   * self-managed GitLab. Default: `'https://gitlab.com'`. */
  BASE_URL: Type.String({
    default: 'https://gitlab.com'
  }),
  /** GitLab user info endpoint. Default: `'https://gitlab.com/api/v4/user'`. */
  USER_INFO_URL: Type.String({
    default: 'https://gitlab.com/api/v4/user'
  }),
  /** Extra query parameters of the GitLab authorization request. Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});

export const oauth2LinkedinConfig = defineConfig('security.oauth2.linkedin', {
  /** Enable LinkedIn OAuth2 provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** LinkedIn OAuth2 client ID. */
  CLIENT_ID: Type.Optional(Type.String()),
  /** LinkedIn OAuth2 client secret. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** LinkedIn user info endpoint. Default: `'https://api.linkedin.com/v2/userinfo'`. */
  USER_INFO_URL: Type.String({
    default: 'https://api.linkedin.com/v2/userinfo'
  }),
  /** Extra query parameters of the LinkedIn authorization request. Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});

export const oauth2AppleConfig = defineConfig('security.oauth2.apple', {
  /** Enable Apple OAuth2 provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Apple OAuth2 client ID (the Services ID identifier). */
  CLIENT_ID: Type.Optional(Type.String()),
  /** Apple OAuth2 client secret. Apple expects a signed ES256 JWT here; when omitted, one is generated from
   * `SECURITY_OAUTH2_APPLE_TEAM_ID`, `SECURITY_OAUTH2_APPLE_KEY_ID` and the private key. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** Apple developer team ID, used to generate the client secret. */
  TEAM_ID: Type.Optional(Type.String()),
  /** Identifier of the Apple `.p8` signing key, used to generate the client secret. */
  KEY_ID: Type.Optional(Type.String()),
  /** Contents of the Apple `.p8` private key (PEM), used to generate the client secret. Takes precedence over
   * `SECURITY_OAUTH2_APPLE_PRIVATE_KEY_PATH`. */
  PRIVATE_KEY: Type.Optional(Type.String()),
  /** Path to the Apple `.p8` private key file, used to generate the client secret. */
  PRIVATE_KEY_PATH: Type.Optional(Type.String()),
  /** Lifetime in seconds of the generated Apple client secret. Apple rejects anything above `15777000` (6 months).
   * Default: `15552000` (180 days). */
  CLIENT_SECRET_EXPIRES_IN: Type.Integer({
    default: 15552000
  }),
  /** Extra query parameters of the Apple authorization request. Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});

export const oauth2MicrosoftConfig = defineConfig('security.oauth2.microsoft', {
  /** Enable Microsoft OAuth2 provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Microsoft OAuth2 client ID (the Entra ID application ID). */
  CLIENT_ID: Type.Optional(Type.String()),
  /** Microsoft OAuth2 client secret. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** Microsoft tenant used in the authorize and token endpoints. Values: a tenant ID, `common`, `organizations` or
   * `consumers`. Default: `'common'`. */
  TENANT: Type.String({ default: 'common' }),
  /** Microsoft user info endpoint. Default: `'https://graph.microsoft.com/v1.0/me'`. */
  USER_INFO_URL: Type.String({
    default: 'https://graph.microsoft.com/v1.0/me'
  }),
  /** Extra query parameters of the Microsoft authorization request, i.e. `{ "prompt": "select_account" }`.
   * Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});

export const oauth2CustomConfig = defineConfig('security.oauth2.custom', {
  /** Enable a custom OpenID Connect provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Custom OAuth2 client ID. */
  CLIENT_ID: Type.Optional(Type.String()),
  /** Custom OAuth2 client secret. */
  CLIENT_SECRET: Type.Optional(Type.String()),
  /** OpenID Connect issuer URL (used for discovery). */
  ISSUER: Type.Optional(Type.String()),
  /** Extra query parameters of the custom OpenID Connect authorization request, i.e. `{ "prompt": "login" }`.
   * Default: `{}`. */
  AUTHORIZATION_PARAMS: Type.Record(Type.String(), Type.String(), {
    default: {}
  })
});
