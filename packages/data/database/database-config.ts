import path from 'node:path';
import { Type } from '@sinclair/typebox';
import {
  ConfigurationError,
  defineConfig,
  DatabaseEvent,
  DatabaseType,
  ErrorCode,
  resolveDatabaseType
} from '@appweaver/common';

export const databaseConfig = defineConfig('database', {
  /** Database type. Values: `sqlite`, `postgresql`, `mysql`, `sqlserver`. */
  TYPE: Type.Optional(Type.Enum(DatabaseType)),
  /** Database connection URL/DSN the application queries the data with. Default: `''`. */
  URL: Type.String({ default: '' }),
  /** Database connection URL/DSN of the migrations (`prisma.config.ts`) and of the database setup of `weaver migrate`,
   * i.e. a user owning the tables, or a direct connection beside the pooled one of `URL`. Default: `''` (the `URL`). */
  MIGRATION_URL: Type.String({ default: '' }),
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
   * Default: `0`. */
  SLOW_QUERY_THRESHOLD: Type.Integer({ default: 0, minimum: 0 }),
  /** Database provider: `auto` or `prisma`, or `none` for an application without a database. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});

/**
 * Returns the URL the migrations run with: `database.migrationUrl`, or `database.url` when it is not set.
 *
 * @return {string} The connection URL of the migrations.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` when the migration URL points to another type of database, or
 * another database name, than the URL of the application, i.e. an environment overriding one URL but not the other.
 */
export function migrationUrl(): string {
  const url = databaseConfig.URL;
  const migration = databaseConfig.MIGRATION_URL;
  if (!migration || !url) {
    return migration || url;
  }

  // Compared by the URLs alone, since database.type names the type of both
  const type = resolveDatabaseType(undefined, url);
  const migrationType = resolveDatabaseType(undefined, migration);
  const name = databaseName(url);
  const migrationName = databaseName(migration);
  if (type !== migrationType || name !== migrationName) {
    const describe = (dbType: string, dbName?: string) =>
      `the ${dbType} database${dbName ? ` ${dbName}` : ''}`;
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `DATABASE_MIGRATION_URL (config.database.migrationUrl) points to ${describe(migrationType, migrationName)}, ` +
        `while DATABASE_URL (config.database.url) points to ${describe(type, name)}`
    );
  }
  return migration;
}

/** The name of the database of a connection URL, or the path of a SQLite file. */
function databaseName(url: string): string | undefined {
  if (/^sqlserver:/i.test(url)) {
    return /;\s*(?:database|initial catalog)\s*=\s*([^;]+)/i
      .exec(url)?.[1]
      ?.trim();
  }
  if (/^(postgres(ql)?|mysql|mariadb):/i.test(url)) {
    try {
      return decodeURIComponent(new URL(url).pathname.slice(1)) || undefined;
    } catch {
      return undefined;
    }
  }
  return path.normalize(url.replace(/^file:/, '').split('?')[0]);
}
