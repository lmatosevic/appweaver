import { Type } from '@sinclair/typebox';
import { defineConfig, DatabaseEvent, DatabaseType } from '@appweaver/common';

export const databaseConfig = defineConfig('database', {
  /** Database type. Values: `sqlite`, `postgresql`, `mysql`, `sqlserver`. */
  TYPE: Type.Optional(Type.Enum(DatabaseType)),
  /** Database connection URL/DSN. Default: `''`. */
  URL: Type.String({ default: '' }),
  /** Path to a Prisma schema file. Default: `'./database/schema.prisma'`. */
  SCHEMA_PATH: Type.String({
    default: './database/schema.prisma'
  }),
  /** Path to the database migrations directory. Default: `'./database/migrations'`. */
  MIGRATIONS_DIR_PATH: Type.String({
    default: './database/migrations'
  }),
  /** Path to the database seeders directory. Default: `'./database/seeders'`. */
  SEEDERS_DIR_PATH: Type.String({
    default: './database/seeders'
  }),
  /** Path for generated Prisma client output. Default: `'./database/client'`. */
  CLIENT_OUTPUT_DIR_PATH: Type.String({
    default: './database/client'
  }),
  /** Max wait time for acquiring a transaction lock in milliseconds. Default: `2000` (2 sec). */
  TRANSACTION_MAX_WAIT: Type.Integer({ default: 2000 }),
  /** Transaction timeout in milliseconds. Default: `5000` (5 sec). */
  TRANSACTION_TIMEOUT: Type.Integer({ default: 5000 }),
  /** Allow an AI agent to run dangerous Prisma actions, such as a database reset. Disable it in production.
   * Default: `true`. */
  AI_DANGEROUS_ACTIONS_ENABLED: Type.Boolean({ default: true }),
  /** Array of database events to log. Values: `query`, `info`, `warn`, `error`. Default: `[]`. */
  LOG_EVENTS: Type.Array(Type.Enum(DatabaseEvent), {
    default: []
  }),
  /** Duration in milliseconds from which a query is logged as a warning by the `database` logger, `0` to disable it.
   * Default: `1500`. */
  SLOW_QUERY_THRESHOLD: Type.Integer({ default: 1500, minimum: 0 }),
  /** Database provider: `auto` or `prisma`, or `none` for an application without a database. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
