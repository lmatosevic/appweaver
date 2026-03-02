import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { loadConfigFromEnv, loadConfigFromFiles } from './config-loader';
import { DatabaseType, Environment, LogLevel, MemoryType } from '../enums';

const configSchema = Type.Object({
  APP_ENV: Type.Union([Type.Enum(Environment), Type.String()], {
    default: Environment.Production,
    mapFrom: 'NODE_ENV'
  }),
  APP_NAME: Type.String({ default: 'Appweaver' }),
  APP_DESCRIPTION: Type.Optional(Type.String()),
  APP_HOSTNAME: Type.String({ default: 'http://localhost:6000' }),
  APP_VERSION: Type.String({
    default: 'unknown',
    mapFrom: 'npm_package_version'
  }),
  APP_SCAN_PATH: Type.Optional(Type.String({ default: './dist/src' })),
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

  SERVER_PORT: Type.Integer({ default: 6000 }),
  SERVER_HOST: Type.String({ default: '0.0.0.0' }),
  SERVER_API_PREFIX: Type.String({ default: '/api' }),
  SERVER_BODY_LIMIT_BYTES: Type.Integer({ default: 104857600 }),
  SERVER_STATIC_ENABLED: Type.Boolean({ default: true }),
  SERVER_STATIC_DIR_PATH: Type.String({ default: './public' }),
  SERVER_STATIC_ROUTE_PREFIX: Type.String({ default: '/public' }),
  SERVER_STATIC_MAX_AGE: Type.String({ default: '30d' }),
  SERVER_STATIC_ALLOWED_HOST: Type.Optional(Type.String()),

  RATE_LIMIT_ENABLED: Type.Boolean({ default: true }),
  RATE_LIMIT_MAX: Type.Integer({ default: 1000 }),
  RATE_LIMIT_WINDOW: Type.Integer({ default: 60000 }),
  RATE_LIMIT_STORE: Type.Enum(MemoryType, { default: MemoryType.Redis }),

  SWAGGER_ENABLED: Type.Boolean({ default: true }),
  SWAGGER_PATH: Type.String({ default: '/swagger' }),
  SWAGGER_HIDE_UNTAGGED: Type.Boolean({ default: false }),

  HEALTH_CHECK_ENABLED: Type.Boolean({ default: true }),
  HEALTH_CHECK_ROUTE_PREFIX: Type.String({ default: '/health' }),

  CORS_ORIGIN: Type.String({ default: '*' }),
  CORS_METHODS: Type.Array(Type.String(), { default: ['*'] }),
  CORS_ALLOWED_HEADERS: Type.Array(Type.String(), { default: ['*'] }),
  CORS_EXPOSED_HEADERS: Type.Array(Type.String(), { default: ['*'] }),
  CORS_MAX_AGE: Type.Integer({ default: 86400 }),
  CORS_CREDENTIALS: Type.Boolean({ default: true }),

  DATABASE_TYPE: Type.Optional(Type.Enum(DatabaseType)),
  DATABASE_URL: Type.String({ default: '' }),
  DATABASE_SCHEMA_PATH: Type.String({
    default: './database/schema.prisma'
  }),
  DATABASE_MIGRATIONS_DIR_PATH: Type.String({
    default: './database/migrations'
  }),
  DATABASE_CLIENT_OUTPUT_PATH: Type.String({
    default: './database/client'
  }),
  DATABASE_GENERATED_TYPES_PATH: Type.String({
    default: './src/types/generated.ts'
  }),
  DATABASE_TRANSACTION_MAX_WAIT: Type.Integer({ default: 2000 }),
  DATABASE_TRANSACTION_TIMEOUT: Type.Integer({ default: 5000 }),
  DATABASE_PROVIDER: Type.String({
    default: '@appweaver/core/database/prisma-database'
  }),

  REDIS_URL: Type.String({ default: 'redis://localhost:6379/0' }),
  REDIS_PROVIDER: Type.String({ default: '@appweaver/core/redis/redis' }),

  MEMORY_EXPIRATION_INTERVAL: Type.Integer({ default: 60000 }),
  MEMORY_PROVIDER: Type.String({ default: '@appweaver/core/memory/in-memory' }),

  STORAGE_PATH: Type.String({ default: './storage' }),
  STORAGE_NAME_PATTERN: Type.String({ default: '{name}-{hash}.{extension}' }),
  STORAGE_CACHE_DURATION: Type.Integer({ default: 86400 }),
  STORAGE_PROVIDER: Type.String({
    default: '@appweaver/core/storage/filesystem-storage'
  }),

  SECURITY_ROUTE_PREFIX: Type.String({ default: '/auth' }),
  SECURITY_JWT_SECRET: Type.String({ default: 'abcdefghijklmnopqrst12345' }),
  SECURITY_JWT_EXPIRES_IN: Type.Integer({ default: 2592000 }),
  SECURITY_JWT_REFRESH_EXPIRES_IN: Type.Integer({ default: 5184000 }),

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

  EVENTS_MAX_LISTENERS: Type.Integer({ default: 10 }),
  EVENTS_PROVIDER: Type.String({
    default: '@appweaver/core/events/node-events'
  }),

  EXPORT_BATCH_SIZE: Type.Integer({ default: 1000 }),
  EXPORT_CSV_DELIMITER: Type.String({ default: ';' }),
  EXPORT_CSV_JOIN_DELIMITER: Type.String({ default: ',' }),
  EXPORT_CSV_ADD_HEADERS: Type.Boolean({ default: true }),
  EXPORT_CSV_ADD_SEP_ROW: Type.Boolean({ default: false }),

  MAIL_SMTP_HOST: Type.String({ default: '127.0.0.1' }),
  MAIL_SMTP_PORT: Type.Integer({ default: 587 }),
  MAIL_SMTP_SECURE: Type.Boolean({ default: false }),
  MAIL_SMTP_USER: Type.Optional(Type.String()),
  MAIL_SMTP_PASSWORD: Type.Optional(Type.String()),
  MAIL_SENDER_NAME: Type.Optional(Type.String()),
  MAIL_SENDER_ADDRESS: Type.Optional(Type.String()),
  MAIL_MOCK_SEND: Type.Optional(Type.Boolean({ default: false })),
  MAIL_PROVIDER: Type.String({ default: '@appweaver/core/mailer/smtp-mailer' }),

  SYSTEM_ADMIN_INITIAL_EMAIL: Type.String({ default: 'admin@appweaver.co' }),
  SYSTEM_ADMIN_INITIAL_PASSWORD: Type.Optional(Type.String())
});

const envConfig = loadConfigFromEnv(configSchema);
const filesConfig = loadConfigFromFiles(configSchema);

const config = Value.Parse(configSchema, { ...filesConfig, ...envConfig });

Object.freeze(config);

export { config };
