import { Type } from '@sinclair/typebox';
import { defineConfig, MemoryType } from '@appweaver/common';

export const serverConfig = defineConfig('server', {
  /** HTTP server listening port. Default: `5000`. */
  PORT: Type.Integer({ default: 5000 }),
  /** HTTP server listening host/IP. Default: `'0.0.0.0'`. */
  HOST: Type.String({ default: '0.0.0.0' }),
  /** Base path prefix for all API routes. Default: `'/api'`. */
  API_PREFIX: Type.String({ default: '/api' }),
  /** Maximum request body size. Default: `100M`. */
  BODY_MAX_SIZE: Type.String({ default: '100M' }),
  /** Enable serving static files from the disk. Default: `true`. */
  STATIC_ENABLED: Type.Boolean({ default: true }),
  /** Directory containing static files. Default: `'./public'`. */
  STATIC_DIR_PATH: Type.String({ default: './public' }),
  /** URL prefix for static file routes. Default: `'/public'`. */
  STATIC_ROUTE_PREFIX: Type.String({ default: '/public' }),
  /** HTTP headers for static files. Format of entry: "{header}: {value}". Default: `[]`. */
  STATIC_RESPONSE_HEADERS: Type.Array(Type.String(), { default: [] }),
  /** Cache-Control max-age for static files. Default: `'30d'`. */
  STATIC_MAX_AGE: Type.String({ default: '30d' }),
  /** Host allowed accessing static files (CORS). */
  STATIC_ALLOWED_HOST: Type.Optional(Type.String()),
  /** Trust `X-Forwarded-*` headers from reverse proxies. Default: `true`. */
  TRUST_PROXY: Type.Boolean({ default: true }),
  /** Enable HTTP request/response logging. Default: `false`. */
  REQUEST_LOGGING_ENABLED: Type.Boolean({ default: false }),
  /** Append the message of the database to the detail of a database error response, in every environment. Default: `false`. */
  ERROR_DATABASE_MESSAGE_ENABLED: Type.Boolean({ default: false }),
  /** Maximum number of validation errors a failed request responds with. Above `1` the whole request is validated and
   * every failure is reported, otherwise the validation stops at the first one. Default: `20`. */
  ERROR_RESPONSE_MAX_COUNT: Type.Integer({ default: 20 })
});

export const rateLimitConfig = defineConfig('rateLimit', {
  /** Enable global rate limiting middleware. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Maximum requests allowed per time window. Default: `1000`. */
  MAX: Type.Integer({ default: 1000 }),
  /** Rate limit window in milliseconds. Default: `60000` (1 min). */
  WINDOW: Type.Integer({ default: 60000 }),
  /** IP addresses/patterns exempt from rate limiting. */
  ALLOW_LIST: Type.Optional(Type.Array(Type.String())),
  /** Store backend for tracking limits. Values: `redis`, `in-memory`. Default: `'redis'`. */
  STORE: Type.Enum(MemoryType, { default: MemoryType.Redis }),
  /** Skip rate limiting instead of failing requests when the store errors, e.g. while Redis is down. Default: `true`. */
  SKIP_ON_ERROR: Type.Boolean({ default: true })
});

export const swaggerConfig = defineConfig('swagger', {
  /** Enable Swagger/OpenAPI documentation UI. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** URL path for the Swagger UI. Default: `'/swagger'`. */
  PATH: Type.String({ default: '/swagger' }),
  /** Hide untagged endpoints from documentation. Default: `false`. */
  HIDE_UNTAGGED: Type.Boolean({ default: false })
});

export const corsConfig = defineConfig('cors', {
  /** Allowed origins for CORS requests, where `'*'` allows any origin. Default: `['*']`. */
  ORIGIN: Type.Array(Type.String(), { default: ['*'] }),
  /** Allowed HTTP methods. Default: `['*']`. */
  METHODS: Type.Array(Type.String(), { default: ['*'] }),
  /** Allowed request headers. Default: `['*']`. */
  ALLOWED_HEADERS: Type.Array(Type.String(), { default: ['*'] }),
  /** Headers exposed to the browser. Default: `['*']`. */
  EXPOSED_HEADERS: Type.Array(Type.String(), { default: ['*'] }),
  /** Preflight response cache duration in seconds. Default: `86400` (1 day). */
  MAX_AGE: Type.Integer({ default: 86400 }),
  /** Allow credentials (cookies, auth headers). Default: `true`. */
  CREDENTIALS: Type.Boolean({ default: true })
});
