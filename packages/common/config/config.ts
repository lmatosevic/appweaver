import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  CacheEvictionStrategy,
  CacheInvalidationStrategy,
  DatabaseEvent,
  DatabaseType,
  Environment,
  LogLevel,
  MemoryType,
  Runtime
} from '../enums';
import { loadConfigFromEnv, loadConfigFromFiles } from './config-loader';
import { addHelpers } from './config-helper';

const configSchema = Type.Object({
  /** Application environment. Values: `test`, `local`, `dev`, `staging`, `qa`, `prod`. Mapped from `NODE_ENV`. Default: `'prod'`. */
  APP_ENV: Type.Union([Type.Enum(Environment), Type.String()], {
    default: Environment.Production,
    mapFrom: 'NODE_ENV'
  }),
  /** Application name. Default: `'Appweaver'`. */
  APP_NAME: Type.String({ default: 'Appweaver' }),
  /** Application version. Mapped from `npm_package_version`. Default: `'unknown'`. */
  APP_VERSION: Type.String({
    default: 'unknown',
    mapFrom: 'npm_package_version'
  }),
  /** Application description. */
  APP_DESCRIPTION: Type.Optional(Type.String()),
  /** Application hostname URL. Defaults to `http://localhost:{SERVER_PORT}` if not set. */
  APP_HOSTNAME: Type.String({ default: '' }),
  /** JavaScript runtime. Auto-detected as `bun` if Bun is present, otherwise `node`. */
  APP_RUNTIME: Type.Enum(Runtime, {
    default:
      typeof globalThis['Bun'] !== 'undefined' ? Runtime.Bun : Runtime.Node
  }),
  /** Path to compiled build artifacts. Default: `'./dist'`. */
  APP_BUILD_PATH: Type.String({ default: './dist' }),
  /** Path to source code for auto-scanning. Default: `'./src'`. */
  APP_SCAN_PATH: Type.String({ default: './src' }),
  /** Path to the application entry point file. Default: `'./src/main.ts'`. */
  APP_MAIN_FILE_PATH: Type.String({ default: './src/main.ts' }),
  /** Module paths to autoload on startup. Default: `[]`. */
  APP_AUTOLOAD_MODULES: Type.Array(Type.String(), { default: [] }),

  /** Minimum log level. Values: `silent`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`. Default: `'info'`. */
  LOG_LEVEL: Type.Enum(LogLevel, { default: LogLevel.Info }),
  /** Path to a log file. If unset, logs to console only. */
  LOG_PATH: Type.Optional(Type.String()),
  /** Enable log file rotation. Default: `true`. */
  LOG_ROTATE: Type.Boolean({ default: true }),
  /** Maximum size per log file before rotation. Default: `'100M'`. */
  LOG_ROTATE_SIZE: Type.String({ default: '100M' }),
  /** Maximum total size of all log files. Default: `'5G'`. */
  LOG_ROTATE_MAX_SIZE: Type.String({ default: '5G' }),
  /** Maximum number of rotated log files to keep. Default: `1000`. */
  LOG_ROTATE_MAX_FILES: Type.Integer({ default: 1000 }),
  /** Rotation interval (e.g. `'1d'` for daily). Default: `'1d'`. */
  LOG_ROTATE_INTERVAL: Type.String({ default: '1d' }),
  /** Compress rotated log files with gzip. Default: `true`. */
  LOG_ROTATE_COMPRESS: Type.Boolean({ default: true }),
  /** Enable pretty-printed JSON logs. Default: `false`. */
  LOG_PRETTY: Type.Boolean({ default: false }),

  /** HTTP server listening port. Default: `5000`. */
  SERVER_PORT: Type.Integer({ default: 5000 }),
  /** HTTP server listening host/IP. Default: `'0.0.0.0'`. */
  SERVER_HOST: Type.String({ default: '0.0.0.0' }),
  /** Base path prefix for all API routes. Default: `'/api'`. */
  SERVER_API_PREFIX: Type.String({ default: '/api' }),
  /** Maximum request body size in bytes. Default: `104857600` (100 MB). */
  SERVER_BODY_LIMIT_BYTES: Type.Integer({ default: 104857600 }),
  /** Enable serving static files from the disk. Default: `true`. */
  SERVER_STATIC_ENABLED: Type.Boolean({ default: true }),
  /** Directory containing static files. Default: `'./public'`. */
  SERVER_STATIC_DIR_PATH: Type.String({ default: './public' }),
  /** URL prefix for static file routes. Default: `'/public'`. */
  SERVER_STATIC_ROUTE_PREFIX: Type.String({ default: '/public' }),
  /** Cache-Control max-age for static files. Default: `'30d'`. */
  SERVER_STATIC_MAX_AGE: Type.String({ default: '30d' }),
  /** Host allowed accessing static files (CORS). */
  SERVER_STATIC_ALLOWED_HOST: Type.Optional(Type.String()),
  /** Trust `X-Forwarded-*` headers from reverse proxies. Default: `true`. */
  SERVER_TRUST_PROXY: Type.Boolean({ default: true }),
  /** Enable HTTP request/response logging. Default: `false`. */
  SERVER_REQUEST_LOGGING_ENABLED: Type.Boolean({ default: false }),

  /** Enable global rate limiting middleware. Default: `true`. */
  RATE_LIMIT_ENABLED: Type.Boolean({ default: true }),
  /** Maximum requests allowed per time window. Default: `1000`. */
  RATE_LIMIT_MAX: Type.Integer({ default: 1000 }),
  /** Rate limit window in milliseconds. Default: `60000` (1 min). */
  RATE_LIMIT_WINDOW: Type.Integer({ default: 60000 }),
  /** IP addresses/patterns exempt from rate limiting. */
  RATE_LIMIT_ALLOW_LIST: Type.Optional(Type.Array(Type.String())),
  /** Store backend for tracking limits. Values: `redis`, `in-memory`. Default: `'redis'`. */
  RATE_LIMIT_STORE: Type.Enum(MemoryType, { default: MemoryType.Redis }),

  /** Enable Swagger/OpenAPI documentation UI. Default: `true`. */
  SWAGGER_ENABLED: Type.Boolean({ default: true }),
  /** URL path for the Swagger UI. Default: `'/swagger'`. */
  SWAGGER_PATH: Type.String({ default: '/swagger' }),
  /** Hide untagged endpoints from documentation. Default: `false`. */
  SWAGGER_HIDE_UNTAGGED: Type.Boolean({ default: false }),

  /** Enable the health check endpoint. Default: `true`. */
  HEALTH_CHECK_ENABLED: Type.Boolean({ default: true }),
  /** Require authentication for health check. Default: `true`. */
  HEALTH_CHECK_AUTH: Type.Boolean({ default: true }),
  /** URL prefix for health check routes. Default: `'/health'`. */
  HEALTH_CHECK_ROUTE_PREFIX: Type.String({ default: '/health' }),

  /** Allowed origin(s) for CORS requests. Default: `'*'`. */
  CORS_ORIGIN: Type.String({ default: '*' }),
  /** Allowed HTTP methods. Default: `['*']`. */
  CORS_METHODS: Type.Array(Type.String(), { default: ['*'] }),
  /** Allowed request headers. Default: `['*']`. */
  CORS_ALLOWED_HEADERS: Type.Array(Type.String(), { default: ['*'] }),
  /** Headers exposed to the browser. Default: `['*']`. */
  CORS_EXPOSED_HEADERS: Type.Array(Type.String(), { default: ['*'] }),
  /** Preflight response cache duration in seconds. Default: `86400` (1 day). */
  CORS_MAX_AGE: Type.Integer({ default: 86400 }),
  /** Allow credentials (cookies, auth headers). Default: `true`. */
  CORS_CREDENTIALS: Type.Boolean({ default: true }),

  /** Glob pattern for resource model files. Default: `'./src/resources/"*"/model.ts'`. */
  RESOURCE_MODEL_PATTERN: Type.String({
    default: './src/resources/*/model.ts'
  }),
  /** Glob pattern for resource service files. Default: `'./src/resources/"*"/service.ts'`. */
  RESOURCE_SERVICE_PATTERN: Type.String({
    default: './src/resources/*/service.ts'
  }),
  /** Glob pattern for resource policy files. Default: `'./src/resources/"*"/policy.ts'`. */
  RESOURCE_POLICY_PATTERN: Type.String({
    default: './src/resources/*/policy.ts'
  }),
  /** Glob pattern for resource route files. Default: `'./src/resources/"*"/routes.ts'`. */
  RESOURCE_ROUTE_PATTERN: Type.String({
    default: './src/resources/*/routes.ts'
  }),
  /** Output path for generated TypeScript types. Default: `'./src/types/generated.ts'`. */
  RESOURCE_GENERATED_TYPES_PATH: Type.String({
    default: './src/types/generated.ts'
  }),

  /** Number of records per batch during export. Default: `1000`. */
  EXPORT_BATCH_SIZE: Type.Integer({ default: 1000 }),
  /** CSV field delimiter character. Default: `';'`. */
  EXPORT_CSV_DELIMITER: Type.String({ default: ';' }),
  /** Delimiter for joining array values in CSV cells. Default: `','`. */
  EXPORT_CSV_JOIN_DELIMITER: Type.String({ default: ',' }),
  /** Include a header row in CSV exports. Default: `true`. */
  EXPORT_CSV_ADD_HEADERS: Type.Boolean({ default: true }),
  /** Add a separator row (BOM) for Excel compatibility. Default: `false`. */
  EXPORT_CSV_ADD_SEP_ROW: Type.Boolean({ default: false }),

  /** Base path for authentication routes. Default: `'/auth'`. */
  SECURITY_ROUTE_PREFIX: Type.String({ default: '/auth' }),
  /** Security cache TTL in milliseconds. Default: `300000` (5 min). */
  SECURITY_CACHE_TTL: Type.Integer({ default: 300000 }),
  /** One-time token TTL for authentication in milliseconds. Default: `120000` (2 min). */
  SECURITY_AUTH_OTT_TTL: Type.Integer({ default: 120000 }),
  /** Allowed hosts for post-authentication redirects. Default: `['*']`. */
  SECURITY_ALLOWED_REDIRECT_HOSTS: Type.Array(Type.String(), {
    default: ['*']
  }),
  /** Security store implementation path. Default: `'@appweaver/core/security/store/redis-security-store'`. */
  SECURITY_STORE_PROVIDER: Type.String({
    default: '@appweaver/core/security/store/redis-security-store'
  }),
  /** Keep a database table after migrations. Default: `false`. */
  SECURITY_STORE_KEEP_DATABASE_TABLE: Type.Boolean({ default: false }),
  /** Enable password-based authentication. Default: `true`. */
  SECURITY_PASSWORD_ENABLED: Type.Boolean({ default: true }),
  /** Minimum password length. Default: `8`. */
  SECURITY_PASSWORD_MIN_LENGTH: Type.Integer({ default: 8 }),
  /** Maximum password length. Default: `100`. */
  SECURITY_PASSWORD_MAX_LENGTH: Type.Integer({ default: 100 }),
  /** Require at least one uppercase letter. Default: `true`. */
  SECURITY_PASSWORD_UPPERCASE: Type.Boolean({ default: true }),
  /** Require at least one lowercase letter. Default: `true`. */
  SECURITY_PASSWORD_LOWERCASE: Type.Boolean({ default: true }),
  /** Require at least one digit. Default: `true`. */
  SECURITY_PASSWORD_NUMERIC: Type.Boolean({ default: true }),
  /** Require at least one special character. Default: `true`. */
  SECURITY_PASSWORD_SPECIAL: Type.Boolean({ default: true }),
  /** Base path for account management routes. Default: `'/auth/account'`. */
  SECURITY_ACCOUNT_ROUTE_PREFIX: Type.String({ default: '/auth/account' }),
  /** Enable email verification flow. Default: `true`. */
  SECURITY_ACCOUNT_VERIFY_EMAIL_ENABLED: Type.Boolean({ default: true }),
  /** Email verification token TTL in milliseconds. Default: `7200000` (2 hours). */
  SECURITY_ACCOUNT_VERIFY_EMAIL_OTT_TTL: Type.Integer({ default: 7200000 }),
  /** Enable password reset flow. Default: `true`. */
  SECURITY_ACCOUNT_RESET_PASSWORD_ENABLED: Type.Boolean({ default: true }),
  /** Password reset token TTL in milliseconds. Default: `1800000` (30 min). */
  SECURITY_ACCOUNT_RESET_PASSWORD_OTT_TTL: Type.Integer({ default: 1800000 }),
  /** Enable two-factor authentication. Default: `true`. */
  SECURITY_ACCOUNT_2FA_ENABLED: Type.Boolean({ default: true }),
  /** Force 2FA for all users. Default: `false`. */
  SECURITY_ACCOUNT_2FA_FORCED: Type.Boolean({ default: false }),
  /** 2FA verification code TTL in milliseconds. Default: `300000` (5 min). */
  SECURITY_ACCOUNT_2FA_OTT_TTL: Type.Integer({ default: 300000 }),
  /** Enable Google reCAPTCHA verification. Default: `false`. */
  SECURITY_RECAPTCHA_ENABLED: Type.Boolean({ default: false }),
  /** Google reCAPTCHA secret key. */
  SECURITY_RECAPTCHA_SECRET: Type.Optional(Type.String()),
  /** Request the header name for the reCAPTCHA token. Default: `'x-recaptcha-token'`. */
  SECURITY_RECAPTCHA_HEADER_NAME: Type.String({ default: 'x-recaptcha-token' }),
  /** Minimum reCAPTCHA v3 score threshold (0–1). Default: `0.4`. */
  SECURITY_RECAPTCHA_MIN_SCORE: Type.Number({ default: 0.4 }),
  /** Google reCAPTCHA verification endpoint URL. Default: `'https://www.google.com/recaptcha/api/siteverify'`. */
  SECURITY_RECAPTCHA_VERIFY_URL: Type.String({
    default: 'https://www.google.com/recaptcha/api/siteverify'
  }),
  /** Enable HTTP Basic authentication. Default: `false`. */
  SECURITY_BASIC_ENABLED: Type.Boolean({ default: false }),
  /** HTTP Basic auth realm name. */
  SECURITY_BASIC_REALM: Type.Optional(Type.String()),
  /** Enable proxy mode for Basic auth. Default: `false`. */
  SECURITY_BASIC_PROXY_MODE: Type.Boolean({ default: false }),
  /** Enable API key authentication. Default: `false`. */
  SECURITY_API_KEY_ENABLED: Type.Boolean({ default: false }),
  /** Keep the API key database table after migrations. Default: `false`. */
  SECURITY_API_KEY_KEEP_DATABASE_TABLE: Type.Boolean({ default: false }),
  /** Request the header name for the API key. Default: `'x-api-key'`. */
  SECURITY_API_KEY_HEADER_NAME: Type.String({ default: 'x-api-key' }),
  /** Maximum API key validity duration in milliseconds. */
  SECURITY_API_KEY_MAX_DURATION: Type.Optional(Type.Integer()),
  /** Prefix delimiter between key ID and secret value. Default: `'AK'`. */
  SECURITY_API_KEY_DELIMITER: Type.String({ default: 'AK' }),
  /** HMAC secret for symmetric JWT signing (HS256). If set, RSA keys are not used. */
  SECURITY_JWT_SECRET: Type.Optional(Type.String()),
  /** Path to an RSA public key for JWT verification (RS256). Default: `'./storage/keys/public.key'`. */
  SECURITY_JWT_PUBLIC_KEY_PATH: Type.String({
    default: './storage/keys/public.key'
  }),
  /** Path to an RSA private key for JWT signing (RS256). Default: `'./storage/keys/private.key'`. */
  SECURITY_JWT_PRIVATE_KEY_PATH: Type.String({
    default: './storage/keys/private.key'
  }),
  /** Auto-generate RSA 2048-bit key pair if missing. Default: `true`. */
  SECURITY_JWT_AUTO_GENERATE_KEYS: Type.Boolean({ default: true }),
  /** Access token expiration in seconds. Default: `2592000` (30 days). */
  SECURITY_JWT_EXPIRES_IN: Type.Integer({ default: 2592000 }),
  /** Refresh token expiration in seconds. Default: `5184000` (60 days). */
  SECURITY_JWT_REFRESH_EXPIRES_IN: Type.Integer({ default: 5184000 }),
  /** OAuth2 state parameter TTL in milliseconds. Default: `600000` (10 min). */
  SECURITY_OAUTH2_STATE_TTL: Type.Integer({ default: 600000 }),
  /** Enable Google OAuth2 provider. Default: `false`. */
  SECURITY_OAUTH2_GOOGLE_ENABLED: Type.Boolean({ default: false }),
  /** Google OAuth2 client ID. */
  SECURITY_OAUTH2_GOOGLE_CLIENT_ID: Type.Optional(Type.String()),
  /** Google OAuth2 client secret. */
  SECURITY_OAUTH2_GOOGLE_CLIENT_SECRET: Type.Optional(Type.String()),
  /** Google user info endpoint. Default: `'https://www.googleapis.com/oauth2/v2/userinfo'`. */
  SECURITY_OAUTH2_GOOGLE_USER_INFO_URL: Type.String({
    default: 'https://www.googleapis.com/oauth2/v2/userinfo'
  }),
  /** Enable Facebook OAuth2 provider. Default: `false`. */
  SECURITY_OAUTH2_FACEBOOK_ENABLED: Type.Boolean({ default: false }),
  /** Facebook OAuth2 client ID. */
  SECURITY_OAUTH2_FACEBOOK_CLIENT_ID: Type.Optional(Type.String()),
  /** Facebook OAuth2 client secret. */
  SECURITY_OAUTH2_FACEBOOK_CLIENT_SECRET: Type.Optional(Type.String()),
  /** Facebook user info endpoint. Default: `'https://graph.facebook.com/me'`. */
  SECURITY_OAUTH2_FACEBOOK_USER_INFO_URL: Type.String({
    default: 'https://graph.facebook.com/me'
  }),
  /** Enable a custom OpenID Connect provider. Default: `false`. */
  SECURITY_OAUTH2_CUSTOM_ENABLED: Type.Boolean({ default: false }),
  /** Custom OAuth2 client ID. */
  SECURITY_OAUTH2_CUSTOM_CLIENT_ID: Type.Optional(Type.String()),
  /** Custom OAuth2 client secret. */
  SECURITY_OAUTH2_CUSTOM_CLIENT_SECRET: Type.Optional(Type.String()),
  /** OpenID Connect issuer URL (used for discovery). */
  SECURITY_OAUTH2_CUSTOM_ISSUER: Type.Optional(Type.String()),

  /** Database type. Values: `sqlite`, `postgresql`, `mysql`, `sqlserver`. */
  DATABASE_TYPE: Type.Optional(Type.Enum(DatabaseType)),
  /** Database connection URL/DSN. Default: `''`. */
  DATABASE_URL: Type.String({ default: '' }),
  /** Path to a Prisma schema file. Default: `'./database/schema.prisma'`. */
  DATABASE_SCHEMA_PATH: Type.String({
    default: './database/schema.prisma'
  }),
  /** Path to the database migrations directory. Default: `'./database/migrations'`. */
  DATABASE_MIGRATIONS_DIR_PATH: Type.String({
    default: './database/migrations'
  }),
  /** Path to the database seeders directory. Default: `'./database/seeders'`. */
  DATABASE_SEEDERS_DIR_PATH: Type.String({
    default: './database/seeders'
  }),
  /** Path for generated Prisma client output. Default: `'./database/client'`. */
  DATABASE_CLIENT_OUTPUT_DIR_PATH: Type.String({
    default: './database/client'
  }),
  /** Max wait time for acquiring a transaction lock in milliseconds. Default: `2000` (2 sec). */
  DATABASE_TRANSACTION_MAX_WAIT: Type.Integer({ default: 2000 }),
  /** Transaction timeout in milliseconds. Default: `5000` (5 sec). */
  DATABASE_TRANSACTION_TIMEOUT: Type.Integer({ default: 5000 }),
  /** Array of database events to log. Values: `query`, `info`, `warn`, `error`. Default: `[]`. */
  DATABASE_LOG_EVENTS: Type.Array(Type.Enum(DatabaseEvent), {
    default: []
  }),
  /** Database provider implementation path. Default: `'@appweaver/core/database/prisma-database'`. */
  DATABASE_PROVIDER: Type.String({
    default: '@appweaver/core/database/prisma-database'
  }),

  /** Base directory for file storage. Default: `'./storage'`. */
  STORAGE_PATH: Type.String({ default: './storage' }),
  /** File naming pattern for stored files. Default: `'{name}-{hash}.{extension}'`. */
  STORAGE_NAME_PATTERN: Type.String({ default: '{name}-{hash}.{extension}' }),
  /** File storage cache TTL in milliseconds. Default: `86400000` (24 hours). */
  STORAGE_CACHE_TTL: Type.Integer({ default: 86400000 }),
  /** Storage provider implementation path. Default: `'@appweaver/core/storage/filesystem-storage'`. */
  STORAGE_PROVIDER: Type.String({
    default: '@appweaver/core/storage/filesystem-storage'
  }),

  /** Redis connection URL. Default: `'redis://localhost:6379/0'`. */
  REDIS_URL: Type.String({ default: 'redis://localhost:6379/0' }),
  /** Redis provider implementation path. Default: `'@appweaver/core/memory/redis'`. */
  REDIS_PROVIDER: Type.String({ default: '@appweaver/core/memory/redis' }),

  /** Maximum size of the in-memory store in bytes. */
  MEMORY_MAX_SIZE_BYTES: Type.Optional(Type.Integer()),
  /** In-memory provider implementation path. Default: `'@appweaver/core/memory/in-memory'`. */
  MEMORY_PROVIDER: Type.String({ default: '@appweaver/core/memory/in-memory' }),

  /** Enable the caching system. Default: `true`. */
  CACHE_ENABLED: Type.Boolean({ default: true }),
  /** Clear all cache entries on application startup. Default: `false`. */
  CACHE_CLEAN_START: Type.Boolean({ default: false }),
  /** Prefix prepended to all cache keys. Default: `'cache:'`. */
  CACHE_KEY_PREFIX: Type.String({ default: 'cache:' }),
  /** Maximum number of items in the cache. Default: `1000`. */
  CACHE_MAX_ITEMS: Type.Integer({ default: 1000 }),
  /** Default time-to-live for cache entries in milliseconds. Default: `5000` (5 sec). */
  CACHE_DEFAULT_TTL: Type.Integer({ default: 5000 }),
  /** Grace period before evicting expired items in milliseconds. Default: `10000` (10 sec). */
  CACHE_EVICTION_GRACE_PERIOD: Type.Integer({ default: 10000 }),
  /** Eviction strategy. Values: `LRU`, `LFU`, `FIFO`. Default: `'LRU'`. */
  CACHE_EVICTION_STRATEGY: Type.Enum(CacheEvictionStrategy, {
    default: CacheEvictionStrategy.LRU
  }),
  /** Defer eviction to a background process. Default: `false`. */
  CACHE_EVICTION_DEFERRED: Type.Boolean({ default: false }),
  /** Invalidation strategy. Values: `expire-related`, `expire-all`, `none`. Default: `'expire-related'`. */
  CACHE_INVALIDATION_STRATEGY: Type.Enum(CacheInvalidationStrategy, {
    default: CacheInvalidationStrategy.ExpireRelated
  }),
  /** Defer invalidation to a background process. Default: `false`. */
  CACHE_INVALIDATION_DEFERRED: Type.Boolean({ default: false }),
  /** Cache provider implementation path. Default: `'@appweaver/core/cache/redis-cache'`. */
  CACHE_PROVIDER: Type.String({ default: '@appweaver/core/cache/redis-cache' }),

  /** Number of completed jobs to retain in the queue. Default: `0`. */
  QUEUE_KEEP_COMPLETED_COUNT: Type.Integer({ default: 0 }),
  /** Time to keep completed jobs in seconds. */
  QUEUE_KEEP_COMPLETED_SECONDS: Type.Optional(Type.Integer()),
  /** Number of failed jobs to retain in the queue. Default: `50`. */
  QUEUE_KEEP_FAILED_COUNT: Type.Integer({ default: 50 }),
  /** Time to keep failed jobs in seconds. */
  QUEUE_KEEP_FAILED_SECONDS: Type.Optional(Type.Integer()),
  /** Number of retry attempts for failed jobs. Default: `3`. */
  QUEUE_RETRY_ATTEMPTS: Type.Integer({ default: 3 }),
  /** Initial backoff delay between retries in milliseconds. Default: `3000` (3 sec). */
  QUEUE_RETRY_BACKOFF: Type.Integer({ default: 3000 }),
  /** Retry backoff type. Values: `fixed`, `exponential`. Default: `'fixed'`. */
  QUEUE_RETRY_BACKOFF_TYPE: Type.Enum(
    { fixed: 'fixed', exponential: 'exponential' },
    {
      default: 'fixed'
    }
  ),
  /** Job queue provider implementation path. Default: `'@appweaver/core/queue/bull-queue'`. */
  QUEUE_PROVIDER: Type.String({ default: '@appweaver/core/queue/bull-queue' }),

  /** Auto-start scheduled jobs on application startup. Default: `true`. */
  SCHEDULER_AUTO_START_JOB: Type.Boolean({ default: true }),
  /** Scheduler provider implementation path. Default: `'@appweaver/core/scheduler/cron-scheduler'`. */
  SCHEDULER_PROVIDER: Type.String({
    default: '@appweaver/core/scheduler/cron-scheduler'
  }),

  /** Maximum event listeners per event type. Default: `10`. */
  EVENTS_MAX_LISTENERS: Type.Integer({ default: 10 }),
  /** Event emitter provider implementation path. Default: `'@appweaver/core/events/node-events'`. */
  EVENTS_PROVIDER: Type.String({
    default: '@appweaver/core/events/node-events'
  }),

  /** Default sender name for outgoing emails. */
  MAILER_SENDER_NAME: Type.Optional(Type.String()),
  /** Default sender email address. */
  MAILER_SENDER_ADDRESS: Type.Optional(Type.String()),
  /** Mailer provider implementation path. Default: `'@appweaver/core/mailer/smtp-mailer'`. */
  MAILER_PROVIDER: Type.String({
    default: '@appweaver/core/mailer/smtp-mailer'
  }),
  /** SMTP server hostname. Default: `'127.0.0.1'`. */
  MAILER_SMTP_HOST: Type.String({ default: '127.0.0.1' }),
  /** SMTP server port. Default: `587`. */
  MAILER_SMTP_PORT: Type.Integer({ default: 587 }),
  /** Use TLS/SSL for SMTP connections. Default: `false`. */
  MAILER_SMTP_SECURE: Type.Boolean({ default: false }),
  /** SMTP authentication username. */
  MAILER_SMTP_USER: Type.Optional(Type.String()),
  /** SMTP authentication password. */
  MAILER_SMTP_PASSWORD: Type.Optional(Type.String()),

  /** Initial admin account email created on the first run. Default: `'admin@appweaver.co'`. */
  SYSTEM_ADMIN_INITIAL_EMAIL: Type.String({ default: 'admin@appweaver.co' }),
  /** Initial admin account password. */
  SYSTEM_ADMIN_INITIAL_PASSWORD: Type.Optional(Type.String())
});

const { config: envConfig, files: envFiles } = loadConfigFromEnv(configSchema);
const { config: jsonConfig, files: jsonFiles } =
  loadConfigFromFiles(configSchema);

const configFiles = envFiles.concat(jsonFiles);

const parsedConfig = Value.Parse(configSchema, { ...jsonConfig, ...envConfig });

// Construct application hostname if not already configured
if (!parsedConfig.APP_HOSTNAME) {
  const host =
    parsedConfig.SERVER_HOST === '0.0.0.0'
      ? 'localhost'
      : parsedConfig.SERVER_HOST;
  parsedConfig.APP_HOSTNAME = `http://${host}:${parsedConfig.SERVER_PORT}`;
}

const config = addHelpers(parsedConfig);

Object.freeze(config);

export { config, configFiles };
