# Security

Appweaver provides a comprehensive security system with multiple authentication methods, role-based authorization,
OAuth2 social login, two-factor authentication, reCAPTCHA, and account management. All security features are
configurable and can be enabled/disabled independently.

---

## Authentication methods

Appweaver supports four authentication methods that can be used independently or combined:

| Method       | Config flag                | Header/mechanism                     |
|--------------|----------------------------|--------------------------------------|
| JWT (Bearer) | Always enabled             | `Authorization: Bearer <token>`      |
| HTTP Basic   | `SECURITY_BASIC_ENABLED`   | `Authorization: Basic <base64>`      |
| API Key      | `SECURITY_API_KEY_ENABLED` | `x-api-key: <id><delimiter><secret>` |
| OAuth2       | Per-provider flags         | Browser redirect flow                |

When multiple methods are enabled, the authentication middleware tries each in order. A request is authenticated if any
one method succeeds. If no credentials are present for any method, a 401 error is returned.

### Route authentication configuration

Routes specify which auth methods they accept:

```ts
const config = {
  // Accept only JWT
  create: {
    auth: ['jwt']
  },

  // Accept JWT or API key
  query: {
    auth: ['jwt', 'apiKey']
  },

  // Public route (no auth required)
  find: {
    public: true
  }
};

```

---

## JWT authentication

JWT is the primary authentication method. Appweaver uses RSA (RS256) by default but supports symmetric HMAC (HS256)
if `SECURITY_JWT_SECRET` is set.

### Key management

- RSA 2048-bit key pair generated automatically if `SECURITY_JWT_AUTO_GENERATE_KEYS` is `true` and key files are missing
- Keys stored at `SECURITY_JWT_PUBLIC_KEY_PATH` and `SECURITY_JWT_PRIVATE_KEY_PATH` (default: `./storage/keys/`)
- Generated keys are written with owner-only permissions (`0600` for the private key, `0700` for its directory)
- The default `STORAGE_RESERVED_PATHS` value (`['keys']`) makes the `keys` directory unusable by the file storage layer,
  so uploads can never overwrite the default key location
- If `SECURITY_JWT_SECRET` is set, HMAC signing is used instead of RSA

### Token types and scopes

| Scope     | Purpose               | Access                                                                 |
|-----------|-----------------------|------------------------------------------------------------------------|
| `Auth`    | Full API access       | All routes except `/refresh`, `/send-2fa-code`, `/verify-2fa-code`     |
| `Refresh` | Token renewal only    | Only `POST /auth/refresh`                                              |
| `TwoFA`   | 2FA verification only | Only `POST /account/send-2fa-code` and `POST /account/verify-2fa-code` |

### JWT payload

```json
{
  "scope": "auth | refresh | 2fa",
  "source": "password | apiKey | basic | oauth2Google | oauth2Facebook | oauth2X | oauth2Github | oauth2Gitlab | oauth2Linkedin | oauth2Apple | oauth2Microsoft | oauth2Custom",
  "username": "User email (e.g. admin@example.com)",
  "sub": "User ID (e.g. 123)",
  "iat": "Issued at timestamp (e.g. 1774623924234)"
}
```

### Token validation

On every authenticated request, the server:

1. Verifies the JWT signature
2. Loads the user from the database by `sub` (user ID)
3. Checks that the user is enabled
4. Validates `logoutAt` is before the token's `iat` (tokens issued before logout are rejected)
5. Checks that the token scope allows access to the requested URL

### Auth routes

| Method | Path                    | Auth                | Description                                                                                                 |
|--------|-------------------------|---------------------|-------------------------------------------------------------------------------------------------------------|
| `POST` | `/auth/login`           | Public              | Login with email and password. Returns access + refresh tokens. Rate limited: 12/window.                    |
| `POST` | `/auth/refresh`         | JWT (Refresh scope) | Exchange a refresh token for a new access token. Rate limited: 12/window.                                   |
| `POST` | `/auth/logout`          | JWT                 | Logout. Sets `logoutAt` timestamp to invalidate all existing tokens.                                        |
| `GET`  | `/auth/me`              | JWT                 | Get the current authenticated user's profile.                                                               |
| `POST` | `/auth/change-password` | Any                 | Change password. Requires current password + new password. Invalidates all tokens. Rate limited: 12/window. |
| `POST` | `/auth/exchange-token`  | Public              | Exchange a one-time token (OTT) for JWT access + refresh tokens. Rate limited: 12/window.                   |

---

## HTTP Basic authentication

When enabled, requests with an `Authorization: Basic` header are authenticated against the user database.

**Configuration:**

```json
{
  "config": {
    "security": {
      "basic": {
        "enabled": true,
        "realm": "My App",
        "proxyMode": false
      }
    }
  }
}
```

Uses `@fastify/basic-auth` plugin. Extracts Base64-encoded `username:password` from the header and validates against the
user's stored password hash.

---

## API key authentication

API keys provide long-lived, per-user credentials for programmatic access.

### How it works

1. An authenticated user creates an API key via the CRUD endpoints
2. The server generates a 64-character random secret and stores its SHA256 hash
3. The full key is returned once as `{id}{delimiter}{secret}` (e.g. `42AKa1b2c3d4...`)
4. Subsequent reads show only a masked version: `{id}...{last6chars}`
5. On each request, the server extracts the key from the header, parses `id` and `secret`, hashes the secret, and
   compares against the stored hash

### API key format

```
{id}{SECURITY_API_KEY_DELIMITER}{secret}
```

Default delimiter is `AK`, so a key looks like: `42AKa1b2c3d4e5f6...`

### API key model

| Field         | Type      | Description                                          |
|---------------|-----------|------------------------------------------------------|
| `id`          | int       | Auto-generated ID.                                   |
| `key`         | string    | 64-char secret (shown only at creation).             |
| `keyHash`     | string    | SHA256 hash of the key (stored, hidden from API).    |
| `name`        | string?   | Optional friendly name.                              |
| `description` | string?   | Optional description.                                |
| `enabled`     | boolean   | Whether the key is active.                           |
| `expiresAt`   | dateTime? | Optional expiration date. Enforced on every request. |

### API key policy

- Users can only see and manage their own API keys
- `SECURITY_API_KEY_MAX_DURATION` limits how far in the future `expiresAt` can be set

**Configuration:**

```json
{
  "config": {
    "security": {
      "apiKey": {
        "enabled": true,
        "headerName": "x-api-key",
        "delimiter": "AK",
        "maxDuration": 7776000000
      }
    }
  }
}
```

---

## OAuth2 authentication

Appweaver supports OAuth2 login with Google, Facebook, X, GitHub, GitLab, LinkedIn, Apple, Microsoft, and a custom
OpenID Connect provider. All of them are built from the same `createOAuth2Plugin` factory and follow the same flow.

### OAuth2 flow

```
1. Client redirects to:
   GET /auth/login/{provider}?redirectToUrl=https://myapp.com/dashboard

2. Server validates redirectToUrl against SECURITY_ALLOWED_REDIRECT_HOSTS

3. Server generates a state token (OTT) and redirects to provider:
   -> https://accounts.google.com/o/oauth2/v2/auth?
        client_id=...&
        redirect_uri=https://myapi.com/auth/login/google/callback&
        state={stateToken}&
        scope=profile email&
        response_type=code

4. User authenticates with the provider

5. Provider redirects back to callback:
   GET /auth/login/{provider}/callback?code={authCode}&state={stateToken}

6. Server verifies the state token (one-time use)
7. Server exchanges the code for an access token with the provider
8. Server fetches user info from the provider
9. Server finds the user by email and invokes the optional checkOAuth2User callback
   (aborts with an error when the callback returns a string or an Error).
   New users are registered unless SECURITY_OAUTH2_REGISTRATION_ENABLED=false
10. Server generates an authentication OTT, flagging it when the password has to be confirmed
11. Server redirects to the original URL with the token:
    -> https://myapp.com/dashboard?token={ott}[&passwordRequired=true]
12. Client exchanges the OTT for JWT tokens, adding the password when it was asked for:
    POST /auth/exchange-token { token: "{ott}", password: "..." }
    -> { accessToken, refreshToken }
13. Server records the provider account in the ConnectedAccount table
```

### Providers

Every provider is disabled by default and enabled with `SECURITY_OAUTH2_<NAME>_ENABLED` plus `_CLIENT_ID` and
`_CLIENT_SECRET` (JSON: `security.oauth2.<name>`). Enabling one registers `GET /auth/login/<name>` and
`/auth/login/<name>/callback`. Register the callback URL `{APP_HOSTNAME}{SERVER_API_PREFIX}/auth/login/<name>/callback`
with the provider.

| `<name>`    | Scopes                                    | User info source                            |
|-------------|-------------------------------------------|---------------------------------------------|
| `google`    | `profile`, `email`                        | `googleapis.com/oauth2/v2/userinfo`         |
| `facebook`  | `public_profile`, `email`                 | `graph.facebook.com/me`                     |
| `x`         | `users.read`, `tweet.read`                | `api.x.com/2/users/me`                      |
| `github`    | `read:user`, `user:email`                 | `api.github.com/user`                       |
| `gitlab`    | `read_user`                               | `gitlab.com/api/v4/user`                    |
| `linkedin`  | `openid`, `profile`, `email`              | `api.linkedin.com/v2/userinfo`              |
| `apple`     | `name`, `email`                           | the `id_token` (no endpoint)                |
| `microsoft` | `openid`, `profile`, `email`, `User.Read` | `graph.microsoft.com/v1.0/me`               |
| `custom`    | `openid`, `profile`, `email`              | `{issuer}/protocol/openid-connect/userinfo` |

### Provider anomalies

- **X only releases the email address to approved apps.** The `confirmed_email` field is requested explicitly, but X
  serves it solely to apps granted the email permission in the developer portal — without it the call fails and the
  login is rejected with a 403.
- **Apple's callback is a `POST`** (`response_mode=form_post`), the identity comes from the `id_token`, and the client
  secret is an ES256 JWT signed at startup from `teamId`/`keyId`/the `.p8` key — expiring after
  `clientSecretExpiresIn` seconds, so a longer-running process needs a restart. Set `clientSecret` directly to use your
  own. The name is sent **only on the first authorization**; later logins yield empty `firstName`/`lastName`.
- **GitHub** falls back to `/user/emails` for the primary-verified address when the profile email is private and rejects
  accounts with no verified address.
- **GitLab** self-managed instances need `SECURITY_OAUTH2_GITLAB_BASE_URL` and `_USER_INFO_URL`.
- **Microsoft** uses `SECURITY_OAUTH2_MICROSOFT_TENANT` (default `common`) in its endpoints, and its Graph photo is an
  authenticated binary, so it arrives as `avatarFile` instead of `avatarUrl`.
- **Custom** targets any OpenID Connect provider (Keycloak, Auth0, …) and needs `issuer` instead of preset endpoints.

### Account takeover protection

An OAuth2 sign-in matches an existing user by email, so a provider account carrying someone else's address must not by
itself unlock a password-protected account. The first time a provider is linked to a user that has a `passwordHash`, the
redirect carries `&passwordRequired=true` and `POST /auth/exchange-token` rejects the token unless
`{ token, password }` is sent. The one-time token is spent either way, so a wrong password means restarting the flow.

Confirmation happens once: the pairing is stored in `ConnectedAccount` and later sign-ins pass through. Users without a
password, and users being registered by the current sign-in, are never asked. There is no flag to switch this off — the
check only ever fires where skipping it would hand the account over. Without a `ConnectedAccount` table there is nowhere
to record the confirmation, so the password is asked on every sign-in instead.

A local `verifiedEmail: false` does not block the sign-in — the provider vouches for the address and the password
confirms the account, which together prove more than local verification would. The address is marked verified once the
exchange succeeds.

### Connected accounts

`ConnectedAccount` pairs a provider account with a local user: `provider`, `providerAccountId`, `scope`, `lastLoginAt`
(`createdAt` holds the link date) and a relation to the auth model, indexed on `[provider, providerAccountId]`. A
provider account belongs to one user only — relinking it elsewhere fails with a 403.

The table exists when any OAuth2 provider is enabled; `SECURITY_OAUTH2_CONNECTED_ACCOUNTS_KEEP_DATABASE_TABLE=true`
keeps it after disabling OAuth2, like `SECURITY_API_KEY_KEEP_DATABASE_TABLE` does for API keys.

### OAuth2 registration control and hooks

**Disable OAuth2 registration** — set `SECURITY_OAUTH2_REGISTRATION_ENABLED=false` (JSON:
`security.oauth2.registrationEnabled`) to prevent new users from being created during OAuth2 login. Only users that
already exist in the database (matched by email) can then log in via OAuth2; unknown emails receive a 403 error.

**`checkOAuth2User` callback** — an optional callback on `createAuthService` invoked on every OAuth2 login, before a
user is registered or authenticated. It receives the auth source, the user info extracted from the provider, and the
existing auth user (or `null` when the user would be newly registered). Return nothing to proceed, or return a string,
`Error`, or `HttpError` to abort the flow (a 403 error is thrown, or the `HttpError` as-is):

```ts
// src/resources/user/service.ts
import { AuthSource } from '@appweaver/common';
import { createAuthService, HttpError } from '@appweaver/core';

export default createAuthService({
  modelName: 'User',
  checkOAuth2User: (source, userInfo, authUser) => {
    if (!userInfo.email.endsWith('@mycompany.com')) {
      return new HttpError('Only company accounts are allowed', 403);
    }
    if (!authUser && source === AuthSource.OAuth2Facebook) {
      return 'New accounts cannot be created via Facebook';
    }
    // Return nothing to proceed with registration/login
  },
  registrationData: (source, email, password, additionalData) => ({
    email,
    password,
    name: `${additionalData?.firstName} ${additionalData?.lastName}`
  })
});
```

**User avatar** — `registrationData` and `registrationFiles` receive the provider's picture URL as
`additionalData.avatarUrl` and the downloaded image as `additionalData.avatarFile`
(`{ name, mimeType, size, data: Buffer }`). `SECURITY_OAUTH2_FETCH_AVATAR_ENABLED=false` (JSON:
`security.oauth2.fetchAvatarEnabled`) skips the download, leaving `avatarFile` `undefined`. The download is best-effort:
failures are logged and registration proceeds without the file.

**`registrationFiles` callback** — an optional callback on `createAuthService` that attaches the avatar (or any other
file) to a newly registered user. A file must be linked to an existing resource, so it cannot be part of the
registration payload and is stored right after the user record is created. Return a map of the model's **file fields**
to the files to store; nullish values are skipped, so nothing is stored unless the callback asks for it:

```ts
// src/resources/user/service.ts
export default createAuthService({
  modelName: 'User',
  registrationData: (source, email, password, additionalData) => ({
    email,
    password,
    firstName: additionalData?.firstName ?? ''
  }),
  registrationFiles: (source, additionalData) => ({
    avatar: additionalData?.avatarFile
  })
});
```

The file is validated against the `files.avatar` config of the model (media type, size limit, name pattern, image
processing). Storing it is the best effort: a rejected file is logged and never fails the registration. Outside
registration, use [`FileService.saveBuffer()`](./storage.md#saving-an-in-memory-file).

### Client-side OAuth2 integration example

```ts
// 1. Redirect user to OAuth2 login
window.location.href = 'https://api.myapp.com/api/auth/login/google?redirectToUrl=https://myapp.com/auth/callback';

// 2. On the callback page, extract the token from URL params
const params = new URLSearchParams(window.location.search);
const token = params.get('token');

// 3. Exchange the OTT for JWT tokens
const response = await fetch('https://api.myapp.com/api/auth/exchange-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token })
});

const { accessToken, refreshToken } = await response.json();

// 4. Use the access token for subsequent requests
fetch('https://api.myapp.com/api/products/query', {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

### Redirect URL validation

All redirect URLs (for OAuth2, email verification, password reset) are validated against
`SECURITY_ALLOWED_REDIRECT_HOSTS`. Set this to specific domains in production:

```json
{
  "config": {
    "security": {
      "allowedRedirectHosts": [
        "myapp.com",
        "admin.myapp.com"
      ]
    }
  }
}
```

Default is `['*']` (all hosts allowed).

---

## Authorization

### Role-based access control (RBAC)

Appweaver uses a role-permission model:

- **Roles** have a unique name and contain zero or more **permissions**
- **Users** are assigned zero or more roles
- Routes can require specific roles or permissions

### Route authorization

```ts
// Require any of these roles (OR logic)
create: {
  roles: ['Admin', 'Editor']
}

// Require any of these permissions (OR logic)
update: {
  permissions: ['product:update', 'product:manage']
}
```

### Authorization check order

On every authenticated request:

1. Verify user exists and is enabled
2. Verify `logoutAt` is before token `iat`
3. Verify JWT scope allows access to the URL
4. Verify the user has required roles (if configured)
5. Verify the user has required permissions (if configured)

### Helper functions

```ts
import { hasRole, hasRoles, hasPermission, hasPermissions, currentAuthUser } from '@appweaver/core';

const user = currentAuthUser();

hasRole(user, 'Admin');                          // boolean
hasRoles(user, ['Admin', 'Editor']);              // OR: has at least one
hasRoles(user, ['Admin', 'Editor'], 'and');       // AND: has all

hasPermission(user, 'product:create');            // boolean
hasPermissions(user, ['product:create', 'product:update']);        // OR
hasPermissions(user, ['product:create', 'product:update'], 'and'); // AND
```

### Request context helpers

```ts
import { currentAuthUser, currentAuthType, currentAuthSource } from '@appweaver/core';

const user = currentAuthUser();       // Current authenticated user
const type = currentAuthType();       // 'jwt' | 'apiKey' | 'basic'
const source = currentAuthSource();   // 'Password' | 'OAuth2Google' | 'ApiKey' | etc.
```

---

## Two-factor authentication (2FA)

When enabled, 2FA adds an extra verification step after password login using email-based one-time codes.

### Configuration

```json
{
  "config": {
    "security": {
      "account": {
        "2fa": {
          "enabled": true,
          "forced": false,
          "ottTtl": 300000
        }
      }
    }
  }
}
```

- `enabled` - Allow users to opt into 2FA
- `forced` - Require 2FA for all users regardless of their preference
- `ottTtl` - Code expiration time in milliseconds (default 5 minutes)

### User setting

Users set their 2FA preference via the `twoFactorAuth` field on their profile:

- `'None'` - 2FA disabled for this user
- `'Email'` - 2FA enabled via email codes

### Login flow with 2FA

```
1. POST /auth/login { email, password }
   -> If 2FA required: returns JWT with TwoFA scope (restricted access)
   -> If 2FA not required: returns JWT with Auth scope (full access)

2. POST /account/send-2fa-code
   -> Generates 6-digit code, emails it to user
   -> Returns { challengeId }

3. POST /account/verify-2fa-code { challengeId, code }
   -> Validates code against stored hash
   -> Returns { token } (one-time authentication token)

4. POST /auth/exchange-token { token }
   -> Returns full JWT with Auth scope { accessToken, refreshToken }
```

### 2FA routes

| Method | Path                       | Auth              | Rate limit | Description                                      |
|--------|----------------------------|-------------------|------------|--------------------------------------------------|
| `POST` | `/account/send-2fa-code`   | JWT (TwoFA scope) | 10/15min   | Send 2FA code to user's email.                   |
| `POST` | `/account/verify-2fa-code` | JWT (TwoFA scope) | 12/window  | Verify 2FA code, returns OTT for token exchange. |

---

## reCAPTCHA

Appweaver integrates Google reCAPTCHA v3 for bot protection on sensitive endpoints.

### Configuration

```json
{
  "config": {
    "security": {
      "recaptcha": {
        "enabled": true,
        "secret": "your-recaptcha-secret-key",
        "headerName": "x-recaptcha-token",
        "minScore": 0.4
      }
    }
  }
}
```

### How it works

1. Client gets a reCAPTCHA token from the Google reCAPTCHA v3 widget
2. Client includes the token in the request header: `x-recaptcha-token: <token>`
3. Server sends the token to Google's verification API along with the secret key and client IP
4. Server validates:
    - `success` flag is `true`
    - `action` matches the expected action (if configured on the route)
    - `score` is at or above `SECURITY_RECAPTCHA_MIN_SCORE`

### Using reCAPTCHA on custom routes

```ts
registerRoute(
  async (router) => {
    router.post('/contact', { handler: contactHandler });
  },
  { recaptcha: true, recaptchaAction: 'contact_form', public: true }
);
```

On resource routes:

```ts
createRoutes({
  modelName: 'Comment',
  create: { recaptcha: true, recaptchaAction: 'create_comment' }
});
```

### Routes with reCAPTCHA by default

- `POST /account/send-reset-password` (action: `send-reset-password`)
- `POST /account/reset-password` (action: `reset-password`)

---

## Account management

### Email verification

| Method | Path                             | Auth   | Description                                                                                                        |
|--------|----------------------------------|--------|--------------------------------------------------------------------------------------------------------------------|
| `POST` | `/account/send-verify-email`     | JWT    | Send verification email. Takes `redirectUrl` and optional `type` (`'auto'` or `'manual'`). Rate limited: 10/15min. |
| `POST` | `/account/verify-email`          | Public | Verify email with token from body. Rate limited: 12/window.                                                        |
| `GET`  | `/account/verify-email-redirect` | Public | Auto-verify and redirect. Token from query param. Redirects to `{redirectUrl}?status=ok\|error&message=...`.       |

**Verification types:**

- `auto` (default) – Generates a link that auto-verifies on click and redirects with a status query parameter
- `manual` - Generates a link where the client must POST the token to the verified endpoint

### Password reset

| Method | Path                           | Auth   | reCAPTCHA | Description                                                                         |
|--------|--------------------------------|--------|-----------|-------------------------------------------------------------------------------------|
| `POST` | `/account/send-reset-password` | Public | Yes       | Send password reset email. Takes `email` and `redirectUrl`. Rate limited: 10/15min. |
| `POST` | `/account/reset-password`      | Public | Yes       | Reset password with token and new password. Rate limited: 12/window.                |

**Reset flow:**

1. User requests reset: `POST /account/send-reset-password { email, redirectUrl }`
2. Server generates OTT, emails a link: `{redirectUrl}?token={ott}`
3. User clicks a link, enters a new password
4. Client sends: `POST /account/reset-password { token, password }`
5. Server validates password complexity, updates hash, sets `logoutAt` (invalidates all sessions)

---

## One-time tokens (OTT)

One-time tokens are used internally for various verification flows. They are single-use, purpose-bound, and
time-limited.

### Purposes

| Purpose             | TTL config                                        | Used for                              |
|---------------------|---------------------------------------------------|---------------------------------------|
| `Authentication`    | `SECURITY_AUTH_OTT_TTL` (120s)                    | OAuth2 token exchange, 2FA completion |
| `EmailVerification` | `SECURITY_ACCOUNT_VERIFY_EMAIL_OTT_TTL` (2h)      | Email verification links              |
| `PasswordReset`     | `SECURITY_ACCOUNT_RESET_PASSWORD_OTT_TTL` (30min) | Password reset links                  |
| `TwoFAVerification` | `SECURITY_ACCOUNT_2FA_OTT_TTL` (5min)             | 2FA code challenges                   |
| `OAuth2State`       | `SECURITY_OAUTH2_STATE_TTL` (10min)               | CSRF protection in OAuth2 flow        |

### Storage

OTTs are stored in the configured security store:

- **Redis** (default): `@appweaver/core/security/store/redis-security-store`
- **Database**: `@appweaver/core/security/store/database-security-store`

---

## Auth user model

The security module automatically adds the following fields to the user model:

| Field           | Type             | Default  | Description                                                  |
|-----------------|------------------|----------|--------------------------------------------------------------|
| `email`         | string (unique)  | -        | User's email address.                                        |
| `passwordHash`  | string? (hidden) | -        | Bcrypt password hash (never exposed in API).                 |
| `verifiedEmail` | boolean          | `false`  | Whether the user's email is verified.                        |
| `twoFactorAuth` | enum             | `'None'` | 2FA setting. Values: `'None'`, `'Email'`.                    |
| `enabled`       | boolean          | `true`   | Whether the account is active.                               |
| `logoutAt`      | dateTime?        | -        | Timestamp used to invalidate tokens issued before this time. |

**Relations:**

| Relation  | Type     | Description                                                         |
|-----------|----------|---------------------------------------------------------------------|
| `roles`   | Role[]   | Assigned roles with nested permissions (always included in output). |
| `apiKeys` | ApiKey[] | User's API keys (if API key auth is enabled).                       |

---

## Password handling

### Hashing

Passwords are hashed using bcrypt with automatic salt generation.

### Complexity validation

Password validation is configurable via `SECURITY_PASSWORD_*` properties:

- Minimum length (default: 8)
- Maximum length (default: 100)
- Require an uppercase letter (default: true)
- Require a lowercase letter (default: true)
- Require a digit (default: true)
- Require special character (default: true)

### Token invalidation on password change

Both `change-password` and `reset-password` set `logoutAt` to the current timestamp, which invalidates all existing JWT
tokens across all devices. The `change-password` endpoint returns new tokens so the current session stays active.

---

## Rate limiting on security routes

| Endpoint                            | Limit             |
|-------------------------------------|-------------------|
| `POST /auth/login`                  | 12 per window     |
| `POST /auth/refresh`                | 12 per window     |
| `POST /auth/change-password`        | 12 per window     |
| `POST /auth/exchange-token`         | 12 per window     |
| `POST /account/send-verify-email`   | 10 per 15 minutes |
| `POST /account/verify-email`        | 12 per window     |
| `POST /account/send-reset-password` | 10 per 15 minutes |
| `POST /account/reset-password`      | 12 per window     |
| `POST /account/send-2fa-code`       | 10 per 15 minutes |
| `POST /account/verify-2fa-code`     | 12 per window     |
