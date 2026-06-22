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
import {
  loadConfigFromEnv,
  loadConfigFromFiles,
  loadPackageJson
} from './config-loader';
import { addHelpers } from './config-helper';
import { Config } from './config-type';

const configSchema = Type.Object({
  APP_ENV: Type.Union([Type.Enum(Environment), Type.String()], {
    default: Environment.Production,
    mapFrom: 'NODE_ENV'
  }),
  APP_NAME: Type.String({ default: 'Appweaver' }),
  APP_VERSION: Type.String({
    default: 'unknown',
    mapFrom: 'npm_package_version'
  }),
  APP_DESCRIPTION: Type.Optional(Type.String()),
  APP_HOSTNAME: Type.String({ default: '' }),
  APP_RUNTIME: Type.Enum(Runtime, {
    default:
      typeof globalThis['Bun'] !== 'undefined' ? Runtime.Bun : Runtime.Node
  }),
  APP_BUILD_PATH: Type.String({ default: './dist' }),
  APP_SOURCE_PATH: Type.String({ default: './src' }),
  APP_SCAN_FILES_PATTERN: Type.String({ default: '<srcPath>/*/index.ts' }),
  APP_MAIN_FILE_PATH: Type.String({ default: '<srcPath>/main.ts' }),
  APP_AUTOLOAD_MODULES: Type.Array(Type.String(), { default: [] }),

  LOG_LEVEL: Type.Enum(LogLevel, { default: LogLevel.Info }),
  LOG_PATH: Type.Optional(Type.String()),
  LOG_ROTATE: Type.Boolean({ default: true }),
  LOG_ROTATE_SIZE: Type.String({ default: '100M' }),
  LOG_ROTATE_MAX_SIZE: Type.String({ default: '5G' }),
  LOG_ROTATE_MAX_FILES: Type.Integer({ default: 1000 }),
  LOG_ROTATE_INTERVAL: Type.String({ default: '1d' }),
  LOG_ROTATE_COMPRESS: Type.Boolean({ default: true }),
  LOG_PRETTY: Type.Boolean({ default: false }),

  SERVER_PORT: Type.Integer({ default: 5000 }),
  SERVER_HOST: Type.String({ default: '0.0.0.0' }),
  SERVER_API_PREFIX: Type.String({ default: '/api' }),
  SERVER_BODY_MAX_SIZE: Type.String({ default: '100M' }),
  SERVER_STATIC_ENABLED: Type.Boolean({ default: true }),
  SERVER_STATIC_DIR_PATH: Type.String({ default: './public' }),
  SERVER_STATIC_ROUTE_PREFIX: Type.String({ default: '/public' }),
  SERVER_STATIC_RESPONSE_HEADERS: Type.Array(Type.String(), { default: [] }),
  SERVER_STATIC_MAX_AGE: Type.String({ default: '30d' }),
  SERVER_STATIC_ALLOWED_HOST: Type.Optional(Type.String()),
  SERVER_TRUST_PROXY: Type.Boolean({ default: true }),
  SERVER_REQUEST_LOGGING_ENABLED: Type.Boolean({ default: false }),

  RATE_LIMIT_ENABLED: Type.Boolean({ default: true }),
  RATE_LIMIT_MAX: Type.Integer({ default: 1000 }),
  RATE_LIMIT_WINDOW: Type.Integer({ default: 60000 }),
  RATE_LIMIT_ALLOW_LIST: Type.Optional(Type.Array(Type.String())),
  RATE_LIMIT_STORE: Type.Enum(MemoryType, { default: MemoryType.Redis }),

  SWAGGER_ENABLED: Type.Boolean({ default: true }),
  SWAGGER_PATH: Type.String({ default: '/swagger' }),
  SWAGGER_HIDE_UNTAGGED: Type.Boolean({ default: false }),

  HEALTH_CHECK_ENABLED: Type.Boolean({ default: true }),
  HEALTH_CHECK_AUTH: Type.Boolean({ default: true }),
  HEALTH_CHECK_ROUTE_PREFIX: Type.String({ default: '/health' }),
  HEALTH_CHECK_CACHE_TTL: Type.Integer({ default: 3000 }),
  HEALTH_CHECK_PICK_INSTANCES: Type.Optional(Type.Array(Type.String())),
  HEALTH_CHECK_OMIT_INSTANCES: Type.Optional(Type.Array(Type.String())),

  CORS_ORIGIN: Type.String({ default: '*' }),
  CORS_METHODS: Type.Array(Type.String(), { default: ['*'] }),
  CORS_ALLOWED_HEADERS: Type.Array(Type.String(), { default: ['*'] }),
  CORS_EXPOSED_HEADERS: Type.Array(Type.String(), { default: ['*'] }),
  CORS_MAX_AGE: Type.Integer({ default: 86400 }),
  CORS_CREDENTIALS: Type.Boolean({ default: true }),

  RESOURCE_MODEL_PATTERN: Type.String({
    default: '<srcPath>/resources/*/*model.ts'
  }),
  RESOURCE_SERVICE_PATTERN: Type.String({
    default: '<srcPath>/resources/*/*service.ts'
  }),
  RESOURCE_POLICY_PATTERN: Type.String({
    default: '<srcPath>/resources/*/*policy.ts'
  }),
  RESOURCE_ROUTES_PATTERN: Type.String({
    default: '<srcPath>/resources/*/*routes.ts'
  }),
  RESOURCE_GENERATED_TYPES_PATH: Type.String({
    default: '<srcPath>/types/generated.ts'
  }),

  EXPORT_BATCH_SIZE: Type.Integer({ default: 1000 }),
  EXPORT_CSV_DELIMITER: Type.String({ default: ';' }),
  EXPORT_CSV_JOIN_DELIMITER: Type.String({ default: ',' }),
  EXPORT_CSV_ADD_HEADERS: Type.Boolean({ default: true }),
  EXPORT_CSV_ADD_SEP_ROW: Type.Boolean({ default: false }),

  SECURITY_ROUTE_PREFIX: Type.String({ default: '/auth' }),
  SECURITY_CACHE_TTL: Type.Integer({ default: 300000 }),
  SECURITY_AUTH_OTT_TTL: Type.Integer({ default: 120000 }),
  SECURITY_ALLOWED_REDIRECT_HOSTS: Type.Array(Type.String(), {
    default: ['*']
  }),
  SECURITY_STORE_PROVIDER: Type.String({
    default: '@appweaver/core/security/store/redis-security-store'
  }),
  SECURITY_STORE_KEEP_DATABASE_TABLE: Type.Boolean({ default: false }),
  SECURITY_PASSWORD_ENABLED: Type.Boolean({ default: true }),
  SECURITY_PASSWORD_MIN_LENGTH: Type.Integer({ default: 8 }),
  SECURITY_PASSWORD_MAX_LENGTH: Type.Integer({ default: 100 }),
  SECURITY_PASSWORD_UPPERCASE: Type.Boolean({ default: true }),
  SECURITY_PASSWORD_LOWERCASE: Type.Boolean({ default: true }),
  SECURITY_PASSWORD_NUMERIC: Type.Boolean({ default: true }),
  SECURITY_PASSWORD_SPECIAL: Type.Boolean({ default: true }),
  SECURITY_ACCOUNT_ROUTE_PREFIX: Type.String({ default: '/auth/account' }),
  SECURITY_ACCOUNT_VERIFY_EMAIL_ENABLED: Type.Boolean({ default: true }),
  SECURITY_ACCOUNT_VERIFY_EMAIL_OTT_TTL: Type.Integer({ default: 7200000 }),
  SECURITY_ACCOUNT_RESET_PASSWORD_ENABLED: Type.Boolean({ default: true }),
  SECURITY_ACCOUNT_RESET_PASSWORD_OTT_TTL: Type.Integer({ default: 1800000 }),
  SECURITY_ACCOUNT_2FA_ENABLED: Type.Boolean({ default: true }),
  SECURITY_ACCOUNT_2FA_FORCED: Type.Boolean({ default: false }),
  SECURITY_ACCOUNT_2FA_OTT_TTL: Type.Integer({ default: 300000 }),
  SECURITY_RECAPTCHA_ENABLED: Type.Boolean({ default: false }),
  SECURITY_RECAPTCHA_SECRET: Type.Optional(Type.String()),
  SECURITY_RECAPTCHA_HEADER_NAME: Type.String({ default: 'x-recaptcha-token' }),
  SECURITY_RECAPTCHA_MIN_SCORE: Type.Number({ default: 0.4 }),
  SECURITY_RECAPTCHA_VERIFY_URL: Type.String({
    default: 'https://www.google.com/recaptcha/api/siteverify'
  }),
  SECURITY_BASIC_ENABLED: Type.Boolean({ default: false }),
  SECURITY_BASIC_REALM: Type.Optional(Type.String()),
  SECURITY_BASIC_PROXY_MODE: Type.Boolean({ default: false }),
  SECURITY_API_KEY_ENABLED: Type.Boolean({ default: false }),
  SECURITY_API_KEY_KEEP_DATABASE_TABLE: Type.Boolean({ default: false }),
  SECURITY_API_KEY_HEADER_NAME: Type.String({ default: 'x-api-key' }),
  SECURITY_API_KEY_MAX_DURATION: Type.Optional(Type.Integer()),
  SECURITY_API_KEY_DELIMITER: Type.String({ default: 'AK' }),
  SECURITY_JWT_SECRET: Type.Optional(Type.String()),
  SECURITY_JWT_PUBLIC_KEY_PATH: Type.String({
    default: './storage/keys/public.key'
  }),
  SECURITY_JWT_PRIVATE_KEY_PATH: Type.String({
    default: './storage/keys/private.key'
  }),
  SECURITY_JWT_AUTO_GENERATE_KEYS: Type.Boolean({ default: true }),
  SECURITY_JWT_EXPIRES_IN: Type.Integer({ default: 2592000 }),
  SECURITY_JWT_REFRESH_EXPIRES_IN: Type.Integer({ default: 5184000 }),
  SECURITY_OAUTH2_STATE_TTL: Type.Integer({ default: 600000 }),
  SECURITY_OAUTH2_GOOGLE_ENABLED: Type.Boolean({ default: false }),
  SECURITY_OAUTH2_GOOGLE_CLIENT_ID: Type.Optional(Type.String()),
  SECURITY_OAUTH2_GOOGLE_CLIENT_SECRET: Type.Optional(Type.String()),
  SECURITY_OAUTH2_GOOGLE_USER_INFO_URL: Type.String({
    default: 'https://www.googleapis.com/oauth2/v2/userinfo'
  }),
  SECURITY_OAUTH2_FACEBOOK_ENABLED: Type.Boolean({ default: false }),
  SECURITY_OAUTH2_FACEBOOK_CLIENT_ID: Type.Optional(Type.String()),
  SECURITY_OAUTH2_FACEBOOK_CLIENT_SECRET: Type.Optional(Type.String()),
  SECURITY_OAUTH2_FACEBOOK_USER_INFO_URL: Type.String({
    default: 'https://graph.facebook.com/me'
  }),
  SECURITY_OAUTH2_CUSTOM_ENABLED: Type.Boolean({ default: false }),
  SECURITY_OAUTH2_CUSTOM_CLIENT_ID: Type.Optional(Type.String()),
  SECURITY_OAUTH2_CUSTOM_CLIENT_SECRET: Type.Optional(Type.String()),
  SECURITY_OAUTH2_CUSTOM_ISSUER: Type.Optional(Type.String()),

  DATABASE_TYPE: Type.Optional(Type.Enum(DatabaseType)),
  DATABASE_URL: Type.String({ default: '' }),
  DATABASE_SCHEMA_PATH: Type.String({
    default: './database/schema.prisma'
  }),
  DATABASE_MIGRATIONS_DIR_PATH: Type.String({
    default: './database/migrations'
  }),
  DATABASE_SEEDERS_DIR_PATH: Type.String({
    default: './database/seeders'
  }),
  DATABASE_CLIENT_OUTPUT_DIR_PATH: Type.String({
    default: './database/client'
  }),
  DATABASE_TRANSACTION_MAX_WAIT: Type.Integer({ default: 2000 }),
  DATABASE_TRANSACTION_TIMEOUT: Type.Integer({ default: 5000 }),
  DATABASE_LOG_EVENTS: Type.Array(Type.Enum(DatabaseEvent), {
    default: []
  }),
  DATABASE_PROVIDER: Type.String({
    default: '@appweaver/core/database/prisma-database'
  }),

  STORAGE_PATH: Type.String({ default: './storage' }),
  STORAGE_NAME_PATTERN: Type.String({ default: '{name}-{hash}.{extension}' }),
  STORAGE_CACHE_TTL: Type.Integer({ default: 86400000 }),
  STORAGE_FILES_ROUTE_PREFIX: Type.String({ default: '/files' }),
  STORAGE_PROVIDER: Type.String({
    default: '@appweaver/core/storage/filesystem-storage'
  }),

  REDIS_URL: Type.String({ default: 'redis://localhost:6379/0' }),
  REDIS_PROVIDER: Type.String({ default: '@appweaver/core/memory/redis' }),

  MEMORY_MAX_SIZE: Type.Optional(Type.String()),
  MEMORY_PROVIDER: Type.String({ default: '@appweaver/core/memory/in-memory' }),

  CACHE_ENABLED: Type.Boolean({ default: true }),
  CACHE_CLEAN_START: Type.Boolean({ default: false }),
  CACHE_KEY_PREFIX: Type.String({ default: 'cache:' }),
  CACHE_MAX_ITEMS: Type.Integer({ default: 1000 }),
  CACHE_MAX_SIZE: Type.Optional(Type.String()),
  CACHE_DEFAULT_TTL: Type.Integer({ default: 5000 }),
  CACHE_EVICTION_GRACE_PERIOD: Type.Integer({ default: 1000 }),
  CACHE_EVICTION_STRATEGY: Type.Enum(CacheEvictionStrategy, {
    default: CacheEvictionStrategy.LRU
  }),
  CACHE_EVICTION_DEFERRED: Type.Boolean({ default: false }),
  CACHE_INVALIDATION_STRATEGY: Type.Enum(CacheInvalidationStrategy, {
    default: CacheInvalidationStrategy.ExpireRelated
  }),
  CACHE_INVALIDATION_DEFERRED: Type.Boolean({ default: false }),
  CACHE_PROVIDER: Type.String({ default: '@appweaver/core/cache/redis-cache' }),

  QUEUE_KEEP_COMPLETED_COUNT: Type.Integer({ default: 0 }),
  QUEUE_KEEP_COMPLETED_SECONDS: Type.Optional(Type.Integer()),
  QUEUE_KEEP_FAILED_COUNT: Type.Integer({ default: 50 }),
  QUEUE_KEEP_FAILED_SECONDS: Type.Optional(Type.Integer()),
  QUEUE_RETRY_ATTEMPTS: Type.Integer({ default: 3 }),
  QUEUE_RETRY_BACKOFF: Type.Integer({ default: 3000 }),
  QUEUE_RETRY_BACKOFF_TYPE: Type.Enum(
    { fixed: 'fixed', exponential: 'exponential' },
    {
      default: 'fixed'
    }
  ),
  QUEUE_PROVIDER: Type.String({ default: '@appweaver/core/queue/bull-queue' }),

  SCHEDULER_AUTO_START_JOB: Type.Boolean({ default: true }),
  SCHEDULER_PROVIDER: Type.String({
    default: '@appweaver/core/scheduler/cron-scheduler'
  }),

  EVENTS_MAX_LISTENERS: Type.Integer({ default: 20 }),
  EVENTS_PROVIDER: Type.String({
    default: '@appweaver/core/events/node-events'
  }),

  MAILER_SENDER_NAME: Type.Optional(Type.String()),
  MAILER_SENDER_ADDRESS: Type.Optional(Type.String()),
  MAILER_PROVIDER: Type.String({
    default: '@appweaver/core/mailer/smtp-mailer'
  }),
  MAILER_SMTP_HOST: Type.String({ default: '127.0.0.1' }),
  MAILER_SMTP_PORT: Type.Integer({ default: 587 }),
  MAILER_SMTP_SECURE: Type.Boolean({ default: false }),
  MAILER_SMTP_USER: Type.Optional(Type.String()),
  MAILER_SMTP_PASSWORD: Type.Optional(Type.String()),

  SYSTEM_ADMIN_INITIAL_EMAIL: Type.String({ default: 'admin@appweaver.co' }),
  SYSTEM_ADMIN_INITIAL_PASSWORD: Type.Optional(Type.String())
});

const { config: envConfig, files: envFiles } = loadConfigFromEnv(configSchema);
const { config: jsonConfig, files: jsonFiles } =
  loadConfigFromFiles(configSchema);

const configFiles = envFiles.concat(jsonFiles);

const parsedConfig = Value.Parse(configSchema, { ...jsonConfig, ...envConfig });

// If application version is not set, try to load it from the local package.json
if (parsedConfig.APP_VERSION === 'unknown') {
  try {
    const pkg = loadPackageJson();
    if (pkg.version) {
      parsedConfig.APP_VERSION = pkg.version;
    }
  } catch {
    // package.json does not exist in the project root
  }
}

// Construct application hostname if not already configured
if (!parsedConfig.APP_HOSTNAME) {
  const host =
    parsedConfig.SERVER_HOST === '0.0.0.0'
      ? 'localhost'
      : parsedConfig.SERVER_HOST;
  parsedConfig.APP_HOSTNAME = `http://${host}:${parsedConfig.SERVER_PORT}`;
}

// Replace <srcPath> placeholder with APP_SOURCE_PATH in path variables
for (const property of [
  'APP_SCAN_FILES_PATTERN',
  'APP_MAIN_FILE_PATH',
  'RESOURCE_MODEL_PATTERN',
  'RESOURCE_SERVICE_PATTERN',
  'RESOURCE_POLICY_PATTERN',
  'RESOURCE_ROUTES_PATTERN',
  'RESOURCE_GENERATED_TYPES_PATH'
]) {
  parsedConfig[property] = parsedConfig[property]?.replace(
    '<srcPath>',
    parsedConfig.APP_SOURCE_PATH
  );
}

const config = addHelpers<Config>(parsedConfig);

Object.freeze(config);

export { config, configFiles };
