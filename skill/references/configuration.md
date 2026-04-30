# Configuration

Appweaver uses a centralized configuration system based on TypeBox schema validation. Configuration values are loaded
from multiple sources and merged in priority order.

## Configuration loading order

Configuration is loaded and merged in the following order (later sources override earlier ones):

1. **Default values** defined in the TypeBox schema
2. **Global JSON config** `appweaver.json` (properties under the `config` key)
3. **Environment-specific JSON config** `appweaver.{NODE_ENV}.json`
4. **Default .env file** `.env`
5. **Environment-specific .env file** `.env.{NODE_ENV}` (overrides all above)

## JSON configuration format

Configuration in JSON files is nested under the `config` key using camelCase property names. This is the preferred way
for application configuration (except for passwords and secrets, then use the.env file instead). These are automatically
mapped to their `SCREAMING_SNAKE_CASE` equivalents:

```json
{
  "config": {
    "app": {
      "name": "MyApp",
      "env": "prod"
    },
    "server": {
      "port": 3000,
      "apiPrefix": "/api"
    },
    "database": {
      "url": "postgresql://user:pass@localhost:5432/mydb"
    }
  }
}
```

## Environment variable parsing

- **Boolean**: `'true'`, `'on'`, `'yes'`, `'1'` (case-insensitive) are parsed as `true`; all others as `false`
- **Array**: Comma-separated values are automatically split into arrays
- **Numbers**: Parsed as integers or floats based on schema type
- **Strings**: Used as-is

Unknown environment variables are preserved with an `_appweaver_` prefix.

## Config helper methods

The config object provides type-safe accessor methods:

```ts
import { config } from '@appweaver/common';

config.env('APP_ENV', 'prod');       // string
config.str('APP_NAME', 'MyApp');     // string
config.int('SERVER_PORT', 5000);     // number (integer)
config.float('SOME_RATIO', 0.5);    // number (float)
config.bool('CACHE_ENABLED', true);  // boolean
config.arr('CORS_METHODS', ['*']);   // string[]
```

The config object is frozen with `Object.freeze()` after loading to prevent runtime mutations.

---

## Configuration properties

### Application (APP_*)

| Property                 | Type     | Default                            | Description                                                                                               |
|--------------------------|----------|------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `APP_ENV`                | enum     | `'prod'`                           | Application environment. Values: `test`, `local`, `dev`, `staging`, `qa`, `prod`. Mapped from `NODE_ENV`. |
| `APP_NAME`               | string   | `'Appweaver'`                      | Application name.                                                                                         |
| `APP_DESCRIPTION`        | string?  | -                                  | Application description.                                                                                  |
| `APP_HOSTNAME`           | string   | `'http://localhost:{SERVER_PORT}'` | Application hostname URL.                                                                                 |
| `APP_RUNTIME`            | string   | `'node'`                           | Application runtime. Autodetects Bun global module. Values: `node`, `bun`                                 |
| `APP_VERSION`            | string   | `'unknown'`                        | Application version. Mapped from `npm_package_version`.                                                   |
| `APP_BUILD_PATH`         | string   | `'./dist'`                         | Path to compiled build artifacts.                                                                         |
| `APP_SOURCE_PATH`        | string   | `'./src'`                          | Path to the application source code. Used in other path variables with <srcPath> placeholder.             |
| `APP_SCAN_FILES_PATTERN` | string   | `'<srcPath>/*/index.ts'`           | Glob pattern for scanning application files.                                                              |
| `APP_MAIN_FILE_PATH`     | string   | `'<srcPath>/main.ts'`              | Path to main application entrypoint file.                                                                 |
| `APP_AUTOLOAD_MODULES`   | string[] | `[]`                               | Module paths to auto-load on startup.                                                                     |

### Logging (LOG_*)

| Property               | Type    | Default  | Description                                                                              |
|------------------------|---------|----------|------------------------------------------------------------------------------------------|
| `LOG_LEVEL`            | enum    | `'info'` | Minimum log level. Values: `silent`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `LOG_PATH`             | string? | -        | Path to log file. If unset, logs to console only.                                        |
| `LOG_ROTATE`           | boolean | `true`   | Enable log file rotation.                                                                |
| `LOG_ROTATE_SIZE`      | string  | `'100M'` | Maximum size per log file before rotation.                                               |
| `LOG_ROTATE_MAX_SIZE`  | string  | `'5G'`   | Maximum total size of all log files.                                                     |
| `LOG_ROTATE_MAX_FILES` | integer | `1000`   | Maximum number of rotated log files to keep.                                             |
| `LOG_ROTATE_INTERVAL`  | string  | `'1d'`   | Rotation interval (e.g. `'1d'` for daily).                                               |
| `LOG_ROTATE_COMPRESS`  | boolean | `true`   | Compress rotated log files with gzip.                                                    |
| `LOG_PRETTY`           | boolean | `false`  | Enable pretty-printed JSON logs.                                                         |

### Server (SERVER_*)

| Property                         | Type    | Default      | Description                                         |
|----------------------------------|---------|--------------|-----------------------------------------------------|
| `SERVER_PORT`                    | integer | `5000`       | HTTP server listening port.                         |
| `SERVER_HOST`                    | string  | `'0.0.0.0'`  | HTTP server listening host/IP.                      |
| `SERVER_API_PREFIX`              | string  | `'/api'`     | Base path prefix for all API routes.                |
| `SERVER_BODY_MAX_SIZE`           | string  | `100M`       | Maximum request body size.                          |
| `SERVER_STATIC_ENABLED`          | boolean | `true`       | Enable serving static files from disk.              |
| `SERVER_STATIC_DIR_PATH`         | string  | `'./public'` | Directory containing static files.                  |
| `SERVER_STATIC_ROUTE_PREFIX`     | string  | `'/public'`  | URL prefix for static file routes.                  |
| `SERVER_STATIC_MAX_AGE`          | string  | `'30d'`      | Cache-Control max-age for static files.             |
| `SERVER_STATIC_ALLOWED_HOST`     | string? | -            | Host allowed to access static files (CORS).         |
| `SERVER_TRUST_PROXY`             | boolean | `true`       | Trust `X-Forwarded-*` headers from reverse proxies. |
| `SERVER_REQUEST_LOGGING_ENABLED` | boolean | `false`      | Enable HTTP request/response logging.               |

### Rate limiting (RATE_LIMIT_*)

| Property                | Type      | Default   | Description                                                      |
|-------------------------|-----------|-----------|------------------------------------------------------------------|
| `RATE_LIMIT_ENABLED`    | boolean   | `true`    | Enable global rate limiting middleware.                          |
| `RATE_LIMIT_MAX`        | integer   | `1000`    | Maximum requests allowed per time window.                        |
| `RATE_LIMIT_WINDOW`     | integer   | `60000`   | Rate limit window in milliseconds.                               |
| `RATE_LIMIT_ALLOW_LIST` | string[]? | -         | IP addresses/patterns exempt from rate limiting.                 |
| `RATE_LIMIT_STORE`      | enum      | `'redis'` | Store backend for tracking limits. Values: `redis`, `in-memory`. |

### Swagger / OpenAPI (SWAGGER_*)

| Property                | Type    | Default      | Description                                 |
|-------------------------|---------|--------------|---------------------------------------------|
| `SWAGGER_ENABLED`       | boolean | `true`       | Enable Swagger/OpenAPI documentation UI.    |
| `SWAGGER_PATH`          | string  | `'/swagger'` | URL path for the Swagger UI.                |
| `SWAGGER_HIDE_UNTAGGED` | boolean | `false`      | Hide untagged endpoints from documentation. |

### Health check (HEALTH_CHECK_*)

| Property                      | Type      | Default     | Description                                                   |
|-------------------------------|-----------|-------------|---------------------------------------------------------------|
| `HEALTH_CHECK_ENABLED`        | boolean   | `true`      | Enable the health check endpoint.                             |
| `HEALTH_CHECK_AUTH`           | boolean   | `true`      | Require authentication for health check.                      |
| `HEALTH_CHECK_ROUTE_PREFIX`   | string    | `'/health'` | URL prefix for health check routes.                           |
| `HEALTH_CHECK_CACHE_TTL`      | number    | `3000`      | Cache TTL for the health check response in milliseconds.      |
| `HEALTH_CHECK_PICK_INSTANCES` | string[]? | -           | List of health check instance names to include in response.   |
| `HEALTH_CHECK_OMIT_INSTANCES` | string[]? | -           | List of health check instance names to exclude from response. |

### CORS (CORS_*)

| Property               | Type     | Default | Description                                   |
|------------------------|----------|---------|-----------------------------------------------|
| `CORS_ORIGIN`          | string   | `'*'`   | Allowed origin(s) for CORS requests.          |
| `CORS_METHODS`         | string[] | `['*']` | Allowed HTTP methods.                         |
| `CORS_ALLOWED_HEADERS` | string[] | `['*']` | Allowed request headers.                      |
| `CORS_EXPOSED_HEADERS` | string[] | `['*']` | Headers exposed to the browser.               |
| `CORS_MAX_AGE`         | integer  | `86400` | Preflight response cache duration in seconds. |
| `CORS_CREDENTIALS`     | boolean  | `true`  | Allow credentials (cookies, auth headers).    |

### Resources (RESOURCE_*)

| Property                        | Type   | Default                              | Description                                 |
|---------------------------------|--------|--------------------------------------|---------------------------------------------|
| `RESOURCE_MODEL_PATTERN`        | string | `'<srcPath>/resources/*/model.ts'`   | Glob pattern for resource model files.      |
| `RESOURCE_SERVICE_PATTERN`      | string | `'<srcPath>/resources/*/service.ts'` | Glob pattern for resource service files.    |
| `RESOURCE_POLICY_PATTERN`       | string | `'<srcPath>/resources/*/policy.ts'`  | Glob pattern for resource policy files.     |
| `RESOURCE_ROUTES_PATTERN`       | string | `'<srcPath>/resources/*/routes.ts'`  | Glob pattern for resource routes files.     |
| `RESOURCE_GENERATED_TYPES_PATH` | string | `'<srcPath>/types/generated.ts'`     | Output path for generated TypeScript types. |

### Data export (EXPORT_*)

| Property                    | Type    | Default | Description                                      |
|-----------------------------|---------|---------|--------------------------------------------------|
| `EXPORT_BATCH_SIZE`         | integer | `1000`  | Number of records per batch during export.       |
| `EXPORT_CSV_DELIMITER`      | string  | `';'`   | CSV field delimiter character.                   |
| `EXPORT_CSV_JOIN_DELIMITER` | string  | `','`   | Delimiter for joining array values in CSV cells. |
| `EXPORT_CSV_ADD_HEADERS`    | boolean | `true`  | Include a header row in CSV exports.             |
| `EXPORT_CSV_ADD_SEP_ROW`    | boolean | `false` | Add separator row (BOM) for Excel compatibility. |

### Security (SECURITY_*)

#### General

| Property                             | Type     | Default                                                 | Description                                      |
|--------------------------------------|----------|---------------------------------------------------------|--------------------------------------------------|
| `SECURITY_ROUTE_PREFIX`              | string   | `'/auth'`                                               | Base path for authentication routes.             |
| `SECURITY_CACHE_TTL`                 | integer  | `300000`                                                | Security cache TTL in milliseconds.              |
| `SECURITY_AUTH_OTT_TTL`              | integer  | `120000`                                                | One-time token TTL for authentication (ms).      |
| `SECURITY_ALLOWED_REDIRECT_HOSTS`    | string[] | `['*']`                                                 | Allowed hosts for post-authentication redirects. |
| `SECURITY_STORE_PROVIDER`            | string   | `'@appweaver/core/security/store/redis-security-store'` | Security store implementation path.              |
| `SECURITY_STORE_KEEP_DATABASE_TABLE` | boolean  | `false`                                                 | Keep database table after migrations.            |

#### Password policy

| Property                       | Type    | Default | Description                             |
|--------------------------------|---------|---------|-----------------------------------------|
| `SECURITY_PASSWORD_ENABLED`    | boolean | `true`  | Enable password-based authentication.   |
| `SECURITY_PASSWORD_MIN_LENGTH` | integer | `8`     | Minimum password length.                |
| `SECURITY_PASSWORD_MAX_LENGTH` | integer | `100`   | Maximum password length.                |
| `SECURITY_PASSWORD_UPPERCASE`  | boolean | `true`  | Require at least one uppercase letter.  |
| `SECURITY_PASSWORD_LOWERCASE`  | boolean | `true`  | Require at least one lowercase letter.  |
| `SECURITY_PASSWORD_NUMERIC`    | boolean | `true`  | Require at least one digit.             |
| `SECURITY_PASSWORD_SPECIAL`    | boolean | `true`  | Require at least one special character. |

#### Account management

| Property                                  | Type    | Default           | Description                                         |
|-------------------------------------------|---------|-------------------|-----------------------------------------------------|
| `SECURITY_ACCOUNT_ROUTE_PREFIX`           | string  | `'/auth/account'` | Base path for account management routes.            |
| `SECURITY_ACCOUNT_VERIFY_EMAIL_ENABLED`   | boolean | `true`            | Enable email verification flow.                     |
| `SECURITY_ACCOUNT_VERIFY_EMAIL_OTT_TTL`   | integer | `7200000`         | Email verification token TTL (ms, default 2 hours). |
| `SECURITY_ACCOUNT_RESET_PASSWORD_ENABLED` | boolean | `true`            | Enable password reset flow.                         |
| `SECURITY_ACCOUNT_RESET_PASSWORD_OTT_TTL` | integer | `1800000`         | Password reset token TTL (ms, default 30 min).      |
| `SECURITY_ACCOUNT_2FA_ENABLED`            | boolean | `true`            | Enable two-factor authentication.                   |
| `SECURITY_ACCOUNT_2FA_FORCED`             | boolean | `false`           | Force 2FA for all users.                            |
| `SECURITY_ACCOUNT_2FA_OTT_TTL`            | integer | `300000`          | 2FA verification code TTL (ms, default 5 min).      |

#### reCAPTCHA

| Property                         | Type    | Default                                             | Description                                  |
|----------------------------------|---------|-----------------------------------------------------|----------------------------------------------|
| `SECURITY_RECAPTCHA_ENABLED`     | boolean | `false`                                             | Enable Google reCAPTCHA verification.        |
| `SECURITY_RECAPTCHA_SECRET`      | string? | -                                                   | Google reCAPTCHA secret key.                 |
| `SECURITY_RECAPTCHA_HEADER_NAME` | string  | `'x-recaptcha-token'`                               | Request header name for the reCAPTCHA token. |
| `SECURITY_RECAPTCHA_MIN_SCORE`   | number  | `0.4`                                               | Minimum reCAPTCHA v3 score threshold (0-1).  |
| `SECURITY_RECAPTCHA_VERIFY_URL`  | string  | `'https://www.google.com/recaptcha/api/siteverify'` | Google reCAPTCHA verification endpoint URL.  |

#### HTTP Basic authentication

| Property                    | Type    | Default | Description                       |
|-----------------------------|---------|---------|-----------------------------------|
| `SECURITY_BASIC_ENABLED`    | boolean | `false` | Enable HTTP Basic authentication. |
| `SECURITY_BASIC_REALM`      | string? | -       | HTTP Basic auth realm name.       |
| `SECURITY_BASIC_PROXY_MODE` | boolean | `false` | Enable proxy mode for Basic auth. |

#### API key authentication

| Property                               | Type     | Default       | Description                                        |
|----------------------------------------|----------|---------------|----------------------------------------------------|
| `SECURITY_API_KEY_ENABLED`             | boolean  | `false`       | Enable API key authentication.                     |
| `SECURITY_API_KEY_KEEP_DATABASE_TABLE` | boolean  | `false`       | Keep API key database table after migrations.      |
| `SECURITY_API_KEY_HEADER_NAME`         | string   | `'x-api-key'` | Request header name for the API key.               |
| `SECURITY_API_KEY_MAX_DURATION`        | integer? | -             | Maximum API key validity duration in milliseconds. |
| `SECURITY_API_KEY_DELIMITER`           | string   | `'AK'`        | Prefix delimiter between key ID and secret value.  |

#### JWT (JSON Web Tokens)

| Property                          | Type    | Default                        | Description                                                                   |
|-----------------------------------|---------|--------------------------------|-------------------------------------------------------------------------------|
| `SECURITY_JWT_SECRET`             | string? | -                              | HMAC secret for symmetric JWT signing (HS256). If set, RSA keys are not used. |
| `SECURITY_JWT_PUBLIC_KEY_PATH`    | string  | `'./storage/keys/public.key'`  | Path to RSA public key for JWT verification (RS256).                          |
| `SECURITY_JWT_PRIVATE_KEY_PATH`   | string  | `'./storage/keys/private.key'` | Path to RSA private key for JWT signing (RS256).                              |
| `SECURITY_JWT_AUTO_GENERATE_KEYS` | boolean | `true`                         | Auto-generate RSA 2048-bit key pair if missing.                               |
| `SECURITY_JWT_EXPIRES_IN`         | integer | `2592000`                      | Access token expiration in seconds (default 30 days).                         |
| `SECURITY_JWT_REFRESH_EXPIRES_IN` | integer | `5184000`                      | Refresh token expiration in seconds (default 60 days).                        |

#### OAuth2 general

| Property                    | Type    | Default  | Description                                                  |
|-----------------------------|---------|----------|--------------------------------------------------------------|
| `SECURITY_OAUTH2_STATE_TTL` | integer | `600000` | OAuth2 state parameter TTL in milliseconds (default 10 min). |

#### OAuth2 Google

| Property                               | Type    | Default                                           | Description                    |
|----------------------------------------|---------|---------------------------------------------------|--------------------------------|
| `SECURITY_OAUTH2_GOOGLE_ENABLED`       | boolean | `false`                                           | Enable Google OAuth2 provider. |
| `SECURITY_OAUTH2_GOOGLE_CLIENT_ID`     | string? | -                                                 | Google OAuth2 client ID.       |
| `SECURITY_OAUTH2_GOOGLE_CLIENT_SECRET` | string? | -                                                 | Google OAuth2 client secret.   |
| `SECURITY_OAUTH2_GOOGLE_USER_INFO_URL` | string  | `'https://www.googleapis.com/oauth2/v2/userinfo'` | Google user info endpoint.     |

#### OAuth2 Facebook

| Property                                 | Type    | Default                           | Description                      |
|------------------------------------------|---------|-----------------------------------|----------------------------------|
| `SECURITY_OAUTH2_FACEBOOK_ENABLED`       | boolean | `false`                           | Enable Facebook OAuth2 provider. |
| `SECURITY_OAUTH2_FACEBOOK_CLIENT_ID`     | string? | -                                 | Facebook OAuth2 client ID.       |
| `SECURITY_OAUTH2_FACEBOOK_CLIENT_SECRET` | string? | -                                 | Facebook OAuth2 client secret.   |
| `SECURITY_OAUTH2_FACEBOOK_USER_INFO_URL` | string  | `'https://graph.facebook.com/me'` | Facebook user info endpoint.     |

#### OAuth2 Custom (OpenID Connect)

| Property                               | Type    | Default | Description                                     |
|----------------------------------------|---------|---------|-------------------------------------------------|
| `SECURITY_OAUTH2_CUSTOM_ENABLED`       | boolean | `false` | Enable custom OpenID Connect provider.          |
| `SECURITY_OAUTH2_CUSTOM_CLIENT_ID`     | string? | -       | Custom OAuth2 client ID.                        |
| `SECURITY_OAUTH2_CUSTOM_CLIENT_SECRET` | string? | -       | Custom OAuth2 client secret.                    |
| `SECURITY_OAUTH2_CUSTOM_ISSUER`        | string? | -       | OpenID Connect issuer URL (used for discovery). |

### Database (DATABASE_*)

| Property                          | Type     | Default                                      | Description                                                              |
|-----------------------------------|----------|----------------------------------------------|--------------------------------------------------------------------------|
| `DATABASE_TYPE`                   | enum?    | -                                            | Database type. Values: `sqlite`, `postgresql`, `mysql`, `sqlserver`.     |
| `DATABASE_URL`                    | string   | `''`                                         | Database connection URL/DSN.                                             |
| `DATABASE_SCHEMA_PATH`            | string   | `'./database/schema.prisma'`                 | Path to Prisma schema file.                                              |
| `DATABASE_MIGRATIONS_DIR_PATH`    | string   | `'./database/migrations'`                    | Path to database migrations directory.                                   |
| `DATABASE_SEEDERS_DIR_PATH`       | string   | `'./database/seeders'`                       | Path to database seeders directory.                                      |
| `DATABASE_CLIENT_OUTPUT_DIR_PATH` | string   | `'./database/client'`                        | Path for generated Prisma client output.                                 |
| `DATABASE_TRANSACTION_MAX_WAIT`   | integer  | `2000`                                       | Max wait time for acquiring a transaction lock (ms).                     |
| `DATABASE_TRANSACTION_TIMEOUT`    | integer  | `5000`                                       | Transaction timeout in milliseconds.                                     |
| `DATABASE_LOG_EVENTS`             | string[] | `[]`                                         | List of database events to log. Values: `query`, `info`, `warn`, `error` |
| `DATABASE_PROVIDER`               | string   | `'@appweaver/core/database/prisma-database'` | Database provider implementation path.                                   |

### File storage (STORAGE_*)

| Property                     | Type    | Default                                        | Description                                   |
|------------------------------|---------|------------------------------------------------|-----------------------------------------------|
| `STORAGE_PATH`               | string  | `'./storage'`                                  | Base directory for file storage.              |
| `STORAGE_NAME_PATTERN`       | string  | `'{name}-{hash}.{extension}'`                  | File naming pattern for stored files.         |
| `STORAGE_CACHE_TTL`          | integer | `86400000`                                     | File storage cache TTL in milliseconds. (24h) |
| `STORAGE_FILES_ROUTE_PREFIX` | string  | `/files`                                       | URL prefix for file access routes.            |
| `STORAGE_PROVIDER`           | string  | `'@appweaver/core/storage/filesystem-storage'` | Storage provider implementation path.         |

### Redis (REDIS_*)

| Property         | Type   | Default                          | Description                         |
|------------------|--------|----------------------------------|-------------------------------------|
| `REDIS_URL`      | string | `'redis://localhost:6379/0'`     | Redis connection URL.               |
| `REDIS_PROVIDER` | string | `'@appweaver/core/memory/redis'` | Redis provider implementation path. |

### In-memory store (MEMORY_*)

| Property          | Type    | Default                              | Description                             |
|-------------------|---------|--------------------------------------|-----------------------------------------|
| `MEMORY_MAX_SIZE` | string? | -                                    | Maximum size of the in-memory store.    |
| `MEMORY_PROVIDER` | string  | `'@appweaver/core/memory/in-memory'` | In-memory provider implementation path. |

### Cache (CACHE_*)

| Property                      | Type    | Default                               | Description                                                            |
|-------------------------------|---------|---------------------------------------|------------------------------------------------------------------------|
| `CACHE_ENABLED`               | boolean | `true`                                | Enable the caching system.                                             |
| `CACHE_CLEAN_START`           | boolean | `false`                               | Clear all cache entries on application startup.                        |
| `CACHE_KEY_PREFIX`            | string  | `'cache:'`                            | Prefix prepended to all cache keys.                                    |
| `CACHE_MAX_ITEMS`             | integer | `1000`                                | Maximum number of items in the cache.                                  |
| `CACHE_CACHE_MAX_SIZE`        | string? | -                                     | Maximum size used by the cache.                                        |
| `CACHE_DEFAULT_TTL`           | integer | `5000`                                | Default time-to-live for cache entries in milliseconds.                |
| `CACHE_EVICTION_GRACE_PERIOD` | integer | `1000`                                | Grace period before evicting expired items (ms).                       |
| `CACHE_EVICTION_STRATEGY`     | enum    | `'LRU'`                               | Eviction strategy. Values: `LRU`, `LFU`, `FIFO`.                       |
| `CACHE_EVICTION_DEFERRED`     | boolean | `false`                               | Defer eviction to a background process.                                |
| `CACHE_INVALIDATION_STRATEGY` | enum    | `'expire-related'`                    | Invalidation strategy. Values: `expire-related`, `expire-all`, `none`. |
| `CACHE_INVALIDATION_DEFERRED` | boolean | `false`                               | Defer invalidation to a background process.                            |
| `CACHE_PROVIDER`              | string  | `'@appweaver/core/cache/redis-cache'` | Cache provider implementation path.                                    |

### Job queue (QUEUE_*)

| Property                       | Type     | Default                              | Description                                            |
|--------------------------------|----------|--------------------------------------|--------------------------------------------------------|
| `QUEUE_KEEP_COMPLETED_COUNT`   | integer  | `0`                                  | Number of completed jobs to retain in the queue.       |
| `QUEUE_KEEP_COMPLETED_SECONDS` | integer? | -                                    | Time to keep completed jobs in seconds.                |
| `QUEUE_KEEP_FAILED_COUNT`      | integer  | `50`                                 | Number of failed jobs to retain in the queue.          |
| `QUEUE_KEEP_FAILED_SECONDS`    | integer? | -                                    | Time to keep failed jobs in seconds.                   |
| `QUEUE_RETRY_ATTEMPTS`         | integer  | `3`                                  | Number of retry attempts for failed jobs.              |
| `QUEUE_RETRY_BACKOFF`          | integer  | `3000`                               | Initial backoff delay between retries in milliseconds. |
| `QUEUE_RETRY_BACKOFF_TYPE`     | enum     | `'fixed'`                            | Retry backoff type. Values: `fixed`, `exponential`.    |
| `QUEUE_PROVIDER`               | string   | `'@appweaver/core/queue/bull-queue'` | Job queue provider implementation path.                |

### Scheduler (SCHEDULER_*)

| Property                   | Type    | Default                                      | Description                                       |
|----------------------------|---------|----------------------------------------------|---------------------------------------------------|
| `SCHEDULER_AUTO_START_JOB` | boolean | `true`                                       | Auto-start scheduled jobs on application startup. |
| `SCHEDULER_PROVIDER`       | string  | `'@appweaver/core/scheduler/cron-scheduler'` | Scheduler provider implementation path.           |

### Events (EVENTS_*)

| Property               | Type    | Default                                | Description                                 |
|------------------------|---------|----------------------------------------|---------------------------------------------|
| `EVENTS_MAX_LISTENERS` | integer | `20`                                   | Maximum event listeners per event type.     |
| `EVENTS_PROVIDER`      | string  | `'@appweaver/core/events/node-events'` | Event emitter provider implementation path. |

### Mailer (MAILER_*)

| Property                | Type    | Default                                | Description                              |
|-------------------------|---------|----------------------------------------|------------------------------------------|
| `MAILER_SENDER_NAME`    | string? | -                                      | Default sender name for outgoing emails. |
| `MAILER_SENDER_ADDRESS` | string? | -                                      | Default sender email address.            |
| `MAILER_PROVIDER`       | string  | `'@appweaver/core/mailer/smtp-mailer'` | Mailer provider implementation path.     |
| `MAILER_SMTP_HOST`      | string  | `'127.0.0.1'`                          | SMTP server hostname.                    |
| `MAILER_SMTP_PORT`      | integer | `587`                                  | SMTP server port.                        |
| `MAILER_SMTP_SECURE`    | boolean | `false`                                | Use TLS/SSL for SMTP connections.        |
| `MAILER_SMTP_USER`      | string? | -                                      | SMTP authentication username.            |
| `MAILER_SMTP_PASSWORD`  | string? | -                                      | SMTP authentication password.            |

### System (SYSTEM_*)

| Property                        | Type    | Default                | Description                                       |
|---------------------------------|---------|------------------------|---------------------------------------------------|
| `SYSTEM_ADMIN_INITIAL_EMAIL`    | string  | `'admin@appweaver.co'` | Initial admin account email created on first run. |
| `SYSTEM_ADMIN_INITIAL_PASSWORD` | string? | -                      | Initial admin account password.                   |

---

## Configuration files summary

| File                   | Purpose                                     |
|------------------------|---------------------------------------------|
| `appweaver.json`       | Global configuration (all environments)     |
| `appweaver.{env}.json` | Environment-specific overrides              |
| `.env`                 | Environment variables (all environments)    |
| `.env.{env}`           | Environment-specific env variable overrides |

## Environment values

`test`, `local`, `dev`, `staging`, `qa`, `prod` or any custom value like `preStaging` or `prod-us-east`
