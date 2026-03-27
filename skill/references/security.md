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

When multiple methods are enabled, the authentication middleware tries each in order. A request is authenticated if
any one method succeeds. If no credentials are present for any method, a 401 error is returned.

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

- RSA 2048-bit key pair generated automatically if `SECURITY_JWT_AUTO_GENERATE_KEYS` is `true` and key files are
  missing
- Keys stored at `SECURITY_JWT_PUBLIC_KEY_PATH` and `SECURITY_JWT_PRIVATE_KEY_PATH` (default: `./storage/keys/`)
- If `SECURITY_JWT_SECRET` is set, HMAC signing is used instead of RSA

### Token types and scopes

| Scope     | Purpose               | Access                                                                 |
|-----------|-----------------------|------------------------------------------------------------------------|
| `Auth`    | Full API access       | All routes except `/refresh`, `/2fa-send-code`, `/verify-2fa-code`     |
| `Refresh` | Token renewal only    | Only `POST /auth/refresh`                                              |
| `TwoFA`   | 2FA verification only | Only `POST /account/send-2fa-code` and `POST /account/verify-2fa-code` |

### JWT payload

```json
{
  "scope": "auth | refresh | 2fa",
  "source": "password | oauth2Google | oauth2Facebook | oauth2Custom | apiKey | basic",
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

Uses `@fastify/basic-auth` plugin. Extracts Base64-encoded `username:password` from the header and validates against
the user's stored password hash.

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

Appweaver supports OAuth2 login with Google, Facebook, and a custom OpenID Connect provider. All OAuth2 providers
follow the same flow pattern.

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
9. Server creates or finds the user by email
10. Server generates an authentication OTT
11. Server redirects to the original URL with the token:
    -> https://myapp.com/dashboard?token={ott}

12. Client exchanges the OTT for JWT tokens:
    POST /auth/exchange-token { token: "{ott}" }
    -> { accessToken, refreshToken }
```

### Google OAuth2

**Configuration:**

```json
{
  "config": {
    "security": {
      "oauth2": {
        "google": {
          "enabled": true,
          "clientId": "your-google-client-id",
          "clientSecret": "your-google-client-secret"
        }
      }
    }
  }
}
```

Or via environment variables:

```env
SECURITY_OAUTH2_GOOGLE_ENABLED=true
SECURITY_OAUTH2_GOOGLE_CLIENT_ID=your-google-client-id
SECURITY_OAUTH2_GOOGLE_CLIENT_SECRET=your-google-client-secret
```

**Routes:**

| Method | Path                          | Description                                                              |
|--------|-------------------------------|--------------------------------------------------------------------------|
| `GET`  | `/auth/login/google`          | Redirect to Google consent screen. Query: `redirectToUrl`.               |
| `GET`  | `/auth/login/google/callback` | Google callback. Exchanges code, creates/finds user, redirects with OTT. |

**Scopes**: `profile`, `email`

**User info extracted**: `email`, `given_name` (firstName), `family_name` (lastName)

**Google Cloud Console setup:**

1. Create OAuth 2.0 credentials in the Google Cloud Console
2. Set the authorized redirect URI to: `{APP_HOSTNAME}{SERVER_API_PREFIX}/auth/login/google/callback`
   (e.g. `https://api.myapp.com/api/auth/login/google/callback`)

### Facebook OAuth2

**Configuration:**

```json
{
  "config": {
    "security": {
      "oauth2": {
        "facebook": {
          "enabled": true,
          "clientId": "your-facebook-app-id",
          "clientSecret": "your-facebook-app-secret"
        }
      }
    }
  }
}
```

Or via environment variables:

```env
SECURITY_OAUTH2_FACEBOOK_ENABLED=true
SECURITY_OAUTH2_FACEBOOK_CLIENT_ID=your-facebook-app-id
SECURITY_OAUTH2_FACEBOOK_CLIENT_SECRET=your-facebook-app-secret
```

**Routes:**

| Method | Path                            | Description                                                                |
|--------|---------------------------------|----------------------------------------------------------------------------|
| `GET`  | `/auth/login/facebook`          | Redirect to Facebook login. Query: `redirectToUrl`.                        |
| `GET`  | `/auth/login/facebook/callback` | Facebook callback. Exchanges code, creates/finds user, redirects with OTT. |

**Scopes**: `public_profile`, `email`

**User info extracted**: `email`, `name` (split into firstName/lastName)

**Facebook Developer Console setup:**

1. Create an app in the Facebook Developer Console
2. Add Facebook Login product
3. Set the valid OAuth redirect URI to: `{APP_HOSTNAME}{SERVER_API_PREFIX}/auth/login/facebook/callback`

### Custom OAuth2 (OpenID Connect)

For any OpenID Connect-compatible provider (Keycloak, Auth0, etc.).

**Configuration:**

```json
{
  "config": {
    "security": {
      "oauth2": {
        "custom": {
          "enabled": true,
          "clientId": "your-client-id",
          "clientSecret": "your-client-secret",
          "issuer": "https://keycloak.example.com/realms/myrealm"
        }
      }
    }
  }
}
```

**Routes:**

| Method | Path                          | Description                                          |
|--------|-------------------------------|------------------------------------------------------|
| `GET`  | `/auth/login/custom`          | Redirect to custom provider. Query: `redirectToUrl`. |
| `GET`  | `/auth/login/custom/callback` | Custom provider callback.                            |

**Scopes**: `openid`, `profile`, `email`

**User info endpoint**: `{issuer}/protocol/openid-connect/userinfo`

**Standard claims expected**: `sub`, `email`, `given_name`, `family_name`

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

Both `change-password` and `reset-password` set `logoutAt` to the current timestamp, which invalidates all existing
JWT tokens across all devices. The `change-password` endpoint returns new tokens so the current session stays active.

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
