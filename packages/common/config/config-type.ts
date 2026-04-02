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

export type Config = {
  /** Application environment. Values: `test`, `local`, `dev`, `staging`, `qa`, `prod`. Mapped from `NODE_ENV`. Default: `'prod'`. */
  APP_ENV: Environment | string;
  /** Application name. Default: `'Appweaver'`. */
  APP_NAME: string;
  /** Application version. Mapped from `npm_package_version`. Default: `'unknown'`. */
  APP_VERSION: string;
  /** Application description. */
  APP_DESCRIPTION?: string;
  /** Application hostname URL. Defaults to `http://localhost:{SERVER_PORT}` if not set. */
  APP_HOSTNAME: string;
  /** JavaScript runtime. Auto-detected as `bun` if Bun is present, otherwise `node`. */
  APP_RUNTIME: Runtime;
  /** Path to compiled build artifacts. Default: `'./dist'`. */
  APP_BUILD_PATH: string;
  /** Path to source code for auto-scanning. Default: `'./src'`. */
  APP_SCAN_PATH: string;
  /** Path to the application entry point file. Default: `'./src/main.ts'`. */
  APP_MAIN_FILE_PATH: string;
  /** Module paths to autoload on startup. Default: `[]`. */
  APP_AUTOLOAD_MODULES: string[];

  /** Minimum log level. Values: `silent`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`. Default: `'info'`. */
  LOG_LEVEL: LogLevel;
  /** Path to a log file. If unset, logs to console only. */
  LOG_PATH?: string;
  /** Enable log file rotation. Default: `true`. */
  LOG_ROTATE: boolean;
  /** Maximum size per log file before rotation. Default: `'100M'`. */
  LOG_ROTATE_SIZE: string;
  /** Maximum total size of all log files. Default: `'5G'`. */
  LOG_ROTATE_MAX_SIZE: string;
  /** Maximum number of rotated log files to keep. Default: `1000`. */
  LOG_ROTATE_MAX_FILES: number;
  /** Rotation interval (e.g. `'1d'` for daily). Default: `'1d'`. */
  LOG_ROTATE_INTERVAL: string;
  /** Compress rotated log files with gzip. Default: `true`. */
  LOG_ROTATE_COMPRESS: boolean;
  /** Enable pretty-printed JSON logs. Default: `false`. */
  LOG_PRETTY: boolean;

  /** HTTP server listening port. Default: `5000`. */
  SERVER_PORT: number;
  /** HTTP server listening host/IP. Default: `'0.0.0.0'`. */
  SERVER_HOST: string;
  /** Base path prefix for all API routes. Default: `'/api'`. */
  SERVER_API_PREFIX: string;
  /** Maximum request body size in bytes. Default: `104857600` (100 MB). */
  SERVER_BODY_LIMIT_BYTES: number;
  /** Enable serving static files from the disk. Default: `true`. */
  SERVER_STATIC_ENABLED: boolean;
  /** Directory containing static files. Default: `'./public'`. */
  SERVER_STATIC_DIR_PATH: string;
  /** URL prefix for static file routes. Default: `'/public'`. */
  SERVER_STATIC_ROUTE_PREFIX: string;
  /** Cache-Control max-age for static files. Default: `'30d'`. */
  SERVER_STATIC_MAX_AGE: string;
  /** Host allowed accessing static files (CORS). */
  SERVER_STATIC_ALLOWED_HOST?: string;
  /** Trust `X-Forwarded-*` headers from reverse proxies. Default: `true`. */
  SERVER_TRUST_PROXY: boolean;
  /** Enable HTTP request/response logging. Default: `false`. */
  SERVER_REQUEST_LOGGING_ENABLED: boolean;

  /** Enable global rate limiting middleware. Default: `true`. */
  RATE_LIMIT_ENABLED: boolean;
  /** Maximum requests allowed per time window. Default: `1000`. */
  RATE_LIMIT_MAX: number;
  /** Rate limit window in milliseconds. Default: `60000` (1 min). */
  RATE_LIMIT_WINDOW: number;
  /** IP addresses/patterns exempt from rate limiting. */
  RATE_LIMIT_ALLOW_LIST?: string[];
  /** Store backend for tracking limits. Values: `redis`, `in-memory`. Default: `'redis'`. */
  RATE_LIMIT_STORE: MemoryType;

  /** Enable Swagger/OpenAPI documentation UI. Default: `true`. */
  SWAGGER_ENABLED: boolean;
  /** URL path for the Swagger UI. Default: `'/swagger'`. */
  SWAGGER_PATH: string;
  /** Hide untagged endpoints from documentation. Default: `false`. */
  SWAGGER_HIDE_UNTAGGED: boolean;

  /** Enable the health check endpoint. Default: `true`. */
  HEALTH_CHECK_ENABLED: boolean;
  /** Require authentication for health check. Default: `true`. */
  HEALTH_CHECK_AUTH: boolean;
  /** URL prefix for health check routes. Default: `'/health'`. */
  HEALTH_CHECK_ROUTE_PREFIX: string;

  /** Allowed origin(s) for CORS requests. Default: `'*'`. */
  CORS_ORIGIN: string;
  /** Allowed HTTP methods. Default: `['*']`. */
  CORS_METHODS: string[];
  /** Allowed request headers. Default: `['*']`. */
  CORS_ALLOWED_HEADERS: string[];
  /** Headers exposed to the browser. Default: `['*']`. */
  CORS_EXPOSED_HEADERS: string[];
  /** Preflight response cache duration in seconds. Default: `86400` (1 day). */
  CORS_MAX_AGE: number;
  /** Allow credentials (cookies, auth headers). Default: `true`. */
  CORS_CREDENTIALS: boolean;

  /** Glob pattern for resource model files. Default: `'./src/resources/"*"/model.ts'`. */
  RESOURCE_MODEL_PATTERN: string;
  /** Glob pattern for resource service files. Default: `'./src/resources/"*"/service.ts'`. */
  RESOURCE_SERVICE_PATTERN: string;
  /** Glob pattern for resource policy files. Default: `'./src/resources/"*"/policy.ts'`. */
  RESOURCE_POLICY_PATTERN: string;
  /** Glob pattern for resource route files. Default: `'./src/resources/"*"/routes.ts'`. */
  RESOURCE_ROUTE_PATTERN: string;
  /** Output path for generated TypeScript types. Default: `'./src/types/generated.ts'`. */
  RESOURCE_GENERATED_TYPES_PATH: string;

  /** Number of records per batch during export. Default: `1000`. */
  EXPORT_BATCH_SIZE: number;
  /** CSV field delimiter character. Default: `';'`. */
  EXPORT_CSV_DELIMITER: string;
  /** Delimiter for joining array values in CSV cells. Default: `','`. */
  EXPORT_CSV_JOIN_DELIMITER: string;
  /** Include a header row in CSV exports. Default: `true`. */
  EXPORT_CSV_ADD_HEADERS: boolean;
  /** Add a separator row (BOM) for Excel compatibility. Default: `false`. */
  EXPORT_CSV_ADD_SEP_ROW: boolean;

  /** Base path for authentication routes. Default: `'/auth'`. */
  SECURITY_ROUTE_PREFIX: string;
  /** Security cache TTL in milliseconds. Default: `300000` (5 min). */
  SECURITY_CACHE_TTL: number;
  /** One-time token TTL for authentication in milliseconds. Default: `120000` (2 min). */
  SECURITY_AUTH_OTT_TTL: number;
  /** Allowed hosts for post-authentication redirects. Default: `['*']`. */
  SECURITY_ALLOWED_REDIRECT_HOSTS: string[];
  /** Security store implementation path. Default: `'@appweaver/core/security/store/redis-security-store'`. */
  SECURITY_STORE_PROVIDER: string;
  /** Keep a database table after migrations. Default: `false`. */
  SECURITY_STORE_KEEP_DATABASE_TABLE: boolean;
  /** Enable password-based authentication. Default: `true`. */
  SECURITY_PASSWORD_ENABLED: boolean;
  /** Minimum password length. Default: `8`. */
  SECURITY_PASSWORD_MIN_LENGTH: number;
  /** Maximum password length. Default: `100`. */
  SECURITY_PASSWORD_MAX_LENGTH: number;
  /** Require at least one uppercase letter. Default: `true`. */
  SECURITY_PASSWORD_UPPERCASE: boolean;
  /** Require at least one lowercase letter. Default: `true`. */
  SECURITY_PASSWORD_LOWERCASE: boolean;
  /** Require at least one digit. Default: `true`. */
  SECURITY_PASSWORD_NUMERIC: boolean;
  /** Require at least one special character. Default: `true`. */
  SECURITY_PASSWORD_SPECIAL: boolean;
  /** Base path for account management routes. Default: `'/auth/account'`. */
  SECURITY_ACCOUNT_ROUTE_PREFIX: string;
  /** Enable email verification flow. Default: `true`. */
  SECURITY_ACCOUNT_VERIFY_EMAIL_ENABLED: boolean;
  /** Email verification token TTL in milliseconds. Default: `7200000` (2 hours). */
  SECURITY_ACCOUNT_VERIFY_EMAIL_OTT_TTL: number;
  /** Enable password reset flow. Default: `true`. */
  SECURITY_ACCOUNT_RESET_PASSWORD_ENABLED: boolean;
  /** Password reset token TTL in milliseconds. Default: `1800000` (30 min). */
  SECURITY_ACCOUNT_RESET_PASSWORD_OTT_TTL: number;
  /** Enable two-factor authentication. Default: `true`. */
  SECURITY_ACCOUNT_2FA_ENABLED: boolean;
  /** Force 2FA for all users. Default: `false`. */
  SECURITY_ACCOUNT_2FA_FORCED: boolean;
  /** 2FA verification code TTL in milliseconds. Default: `300000` (5 min). */
  SECURITY_ACCOUNT_2FA_OTT_TTL: number;
  /** Enable Google reCAPTCHA verification. Default: `false`. */
  SECURITY_RECAPTCHA_ENABLED: boolean;
  /** Google reCAPTCHA secret key. */
  SECURITY_RECAPTCHA_SECRET?: string;
  /** Request the header name for the reCAPTCHA token. Default: `'x-recaptcha-token'`. */
  SECURITY_RECAPTCHA_HEADER_NAME: string;
  /** Minimum reCAPTCHA v3 score threshold (0–1). Default: `0.4`. */
  SECURITY_RECAPTCHA_MIN_SCORE: number;
  /** Google reCAPTCHA verification endpoint URL. Default: `'https://www.google.com/recaptcha/api/siteverify'`. */
  SECURITY_RECAPTCHA_VERIFY_URL: string;
  /** Enable HTTP Basic authentication. Default: `false`. */
  SECURITY_BASIC_ENABLED: boolean;
  /** HTTP Basic auth realm name. */
  SECURITY_BASIC_REALM?: string;
  /** Enable proxy mode for Basic auth. Default: `false`. */
  SECURITY_BASIC_PROXY_MODE: boolean;
  /** Enable API key authentication. Default: `false`. */
  SECURITY_API_KEY_ENABLED: boolean;
  /** Keep the API key database table after migrations. Default: `false`. */
  SECURITY_API_KEY_KEEP_DATABASE_TABLE: boolean;
  /** Request the header name for the API key. Default: `'x-api-key'`. */
  SECURITY_API_KEY_HEADER_NAME: string;
  /** Maximum API key validity duration in milliseconds. */
  SECURITY_API_KEY_MAX_DURATION?: number;
  /** Prefix delimiter between key ID and secret value. Default: `'AK'`. */
  SECURITY_API_KEY_DELIMITER: string;
  /** HMAC secret for symmetric JWT signing (HS256). If set, RSA keys are not used. */
  SECURITY_JWT_SECRET?: string;
  /** Path to an RSA public key for JWT verification (RS256). Default: `'./storage/keys/public.key'`. */
  SECURITY_JWT_PUBLIC_KEY_PATH: string;
  /** Path to an RSA private key for JWT signing (RS256). Default: `'./storage/keys/private.key'`. */
  SECURITY_JWT_PRIVATE_KEY_PATH: string;
  /** Auto-generate RSA 2048-bit key pair if missing. Default: `true`. */
  SECURITY_JWT_AUTO_GENERATE_KEYS: boolean;
  /** Access token expiration in seconds. Default: `2592000` (30 days). */
  SECURITY_JWT_EXPIRES_IN: number;
  /** Refresh token expiration in seconds. Default: `5184000` (60 days). */
  SECURITY_JWT_REFRESH_EXPIRES_IN: number;
  /** OAuth2 state parameter TTL in milliseconds. Default: `600000` (10 min). */
  SECURITY_OAUTH2_STATE_TTL: number;
  /** Enable Google OAuth2 provider. Default: `false`. */
  SECURITY_OAUTH2_GOOGLE_ENABLED: boolean;
  /** Google OAuth2 client ID. */
  SECURITY_OAUTH2_GOOGLE_CLIENT_ID?: string;
  /** Google OAuth2 client secret. */
  SECURITY_OAUTH2_GOOGLE_CLIENT_SECRET?: string;
  /** Google user info endpoint. Default: `'https://www.googleapis.com/oauth2/v2/userinfo'`. */
  SECURITY_OAUTH2_GOOGLE_USER_INFO_URL: string;
  /** Enable Facebook OAuth2 provider. Default: `false`. */
  SECURITY_OAUTH2_FACEBOOK_ENABLED: boolean;
  /** Facebook OAuth2 client ID. */
  SECURITY_OAUTH2_FACEBOOK_CLIENT_ID?: string;
  /** Facebook OAuth2 client secret. */
  SECURITY_OAUTH2_FACEBOOK_CLIENT_SECRET?: string;
  /** Facebook user info endpoint. Default: `'https://graph.facebook.com/me'`. */
  SECURITY_OAUTH2_FACEBOOK_USER_INFO_URL: string;
  /** Enable a custom OpenID Connect provider. Default: `false`. */
  SECURITY_OAUTH2_CUSTOM_ENABLED: boolean;
  /** Custom OAuth2 client ID. */
  SECURITY_OAUTH2_CUSTOM_CLIENT_ID?: string;
  /** Custom OAuth2 client secret. */
  SECURITY_OAUTH2_CUSTOM_CLIENT_SECRET?: string;
  /** OpenID Connect issuer URL (used for discovery). */
  SECURITY_OAUTH2_CUSTOM_ISSUER?: string;

  /** Database type. Values: `sqlite`, `postgresql`, `mysql`, `sqlserver`. */
  DATABASE_TYPE?: DatabaseType;
  /** Database connection URL/DSN. Default: `''`. */
  DATABASE_URL: string;
  /** Path to a Prisma schema file. Default: `'./database/schema.prisma'`. */
  DATABASE_SCHEMA_PATH: string;
  /** Path to the database migrations directory. Default: `'./database/migrations'`. */
  DATABASE_MIGRATIONS_DIR_PATH: string;
  /** Path to the database seeders directory. Default: `'./database/seeders'`. */
  DATABASE_SEEDERS_DIR_PATH: string;
  /** Path for generated Prisma client output. Default: `'./database/client'`. */
  DATABASE_CLIENT_OUTPUT_DIR_PATH: string;
  /** Max wait time for acquiring a transaction lock in milliseconds. Default: `2000` (2 sec). */
  DATABASE_TRANSACTION_MAX_WAIT: number;
  /** Transaction timeout in milliseconds. Default: `5000` (5 sec). */
  DATABASE_TRANSACTION_TIMEOUT: number;
  /** Array of database events to log. Values: `query`, `info`, `warn`, `error`. Default: `[]`. */
  DATABASE_LOG_EVENTS: DatabaseEvent[];
  /** Database provider implementation path. Default: `'@appweaver/core/database/prisma-database'`. */
  DATABASE_PROVIDER: string;

  /** Base directory for file storage. Default: `'./storage'`. */
  STORAGE_PATH: string;
  /** File naming pattern for stored files. Default: `'{name}-{hash}.{extension}'`. */
  STORAGE_NAME_PATTERN: string;
  /** File storage cache TTL in milliseconds. Default: `86400000` (24 hours). */
  STORAGE_CACHE_TTL: number;
  /** Storage provider implementation path. Default: `'@appweaver/core/storage/filesystem-storage'`. */
  STORAGE_PROVIDER: string;

  /** Redis connection URL. Default: `'redis://localhost:6379/0'`. */
  REDIS_URL: string;
  /** Redis provider implementation path. Default: `'@appweaver/core/memory/redis'`. */
  REDIS_PROVIDER: string;

  /** Maximum size of the in-memory store in bytes. */
  MEMORY_MAX_SIZE_BYTES?: number;
  /** In-memory provider implementation path. Default: `'@appweaver/core/memory/in-memory'`. */
  MEMORY_PROVIDER: string;

  /** Enable the caching system. Default: `true`. */
  CACHE_ENABLED: boolean;
  /** Clear all cache entries on application startup. Default: `false`. */
  CACHE_CLEAN_START: boolean;
  /** Prefix prepended to all cache keys. Default: `'cache:'`. */
  CACHE_KEY_PREFIX: string;
  /** Maximum number of items in the cache. Default: `1000`. */
  CACHE_MAX_ITEMS: number;
  /** Maximum used size by the cache in bytes. */
  CACHE_MAX_SIZE_BYTES?: number;
  /** Default time-to-live for cache entries in milliseconds. Default: `5000` (5 sec). */
  CACHE_DEFAULT_TTL: number;
  /** Grace period before evicting expired items in milliseconds. Default: `1000` (1 sec). */
  CACHE_EVICTION_GRACE_PERIOD: number;
  /** Eviction strategy. Values: `LRU`, `LFU`, `FIFO`. Default: `'LRU'`. */
  CACHE_EVICTION_STRATEGY: CacheEvictionStrategy;
  /** Defer eviction to a background process. Default: `false`. */
  CACHE_EVICTION_DEFERRED: boolean;
  /** Invalidation strategy. Values: `expire-related`, `expire-all`, `none`. Default: `'expire-related'`. */
  CACHE_INVALIDATION_STRATEGY: CacheInvalidationStrategy;
  /** Defer invalidation to a background process. Default: `false`. */
  CACHE_INVALIDATION_DEFERRED: boolean;
  /** Cache provider implementation path. Default: `'@appweaver/core/cache/redis-cache'`. */
  CACHE_PROVIDER: string;

  /** Number of completed jobs to retain in the queue. Default: `0`. */
  QUEUE_KEEP_COMPLETED_COUNT: number;
  /** Time to keep completed jobs in seconds. */
  QUEUE_KEEP_COMPLETED_SECONDS?: number;
  /** Number of failed jobs to retain in the queue. Default: `50`. */
  QUEUE_KEEP_FAILED_COUNT: number;
  /** Time to keep failed jobs in seconds. */
  QUEUE_KEEP_FAILED_SECONDS?: number;
  /** Number of retry attempts for failed jobs. Default: `3`. */
  QUEUE_RETRY_ATTEMPTS: number;
  /** Initial backoff delay between retries in milliseconds. Default: `3000` (3 sec). */
  QUEUE_RETRY_BACKOFF: number;
  /** Retry backoff type. Values: `fixed`, `exponential`. Default: `'fixed'`. */
  QUEUE_RETRY_BACKOFF_TYPE: 'fixed' | 'exponential';
  /** Job queue provider implementation path. Default: `'@appweaver/core/queue/bull-queue'`. */
  QUEUE_PROVIDER: string;

  /** Auto-start scheduled jobs on application startup. Default: `true`. */
  SCHEDULER_AUTO_START_JOB: boolean;
  /** Scheduler provider implementation path. Default: `'@appweaver/core/scheduler/cron-scheduler'`. */
  SCHEDULER_PROVIDER: string;

  /** Maximum event listeners per event type. Default: `10`. */
  EVENTS_MAX_LISTENERS: number;
  /** Event emitter provider implementation path. Default: `'@appweaver/core/events/node-events'`. */
  EVENTS_PROVIDER: string;

  /** Default sender name for outgoing emails. */
  MAILER_SENDER_NAME?: string;
  /** Default sender email address. */
  MAILER_SENDER_ADDRESS?: string;
  /** Mailer provider implementation path. Default: `'@appweaver/core/mailer/smtp-mailer'`. */
  MAILER_PROVIDER: string;
  /** SMTP server hostname. Default: `'127.0.0.1'`. */
  MAILER_SMTP_HOST: string;
  /** SMTP server port. Default: `587`. */
  MAILER_SMTP_PORT: number;
  /** Use TLS/SSL for SMTP connections. Default: `false`. */
  MAILER_SMTP_SECURE: boolean;
  /** SMTP authentication username. */
  MAILER_SMTP_USER?: string;
  /** SMTP authentication password. */
  MAILER_SMTP_PASSWORD?: string;

  /** Initial admin account email created on the first run. Default: `'admin@appweaver.co'`. */
  SYSTEM_ADMIN_INITIAL_EMAIL: string;
  /** Initial admin account password. */
  SYSTEM_ADMIN_INITIAL_PASSWORD?: string;
};
