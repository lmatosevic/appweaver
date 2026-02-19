import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import {
  PrismaClientOptions,
  SqlDriverAdapterFactory
} from '@prisma/client/runtime/client';
import { config, DatabaseType, getDatabaseType } from '@appweaver/common';
import { PrismaClient } from '../prisma/client/client';

const options: Omit<PrismaClientOptions, 'adapter'> = {
  transactionOptions: {
    maxWait: config.DATABASE_TRANSACTION_MAX_WAIT,
    timeout: config.DATABASE_TRANSACTION_TIMEOUT
  }
};

/**
 * Creates and returns a PrismaClient instance based on the configured database type.
 *
 * The database type is determined by the `DATABASE_TYPE` configuration value or,
 * if unspecified, by parsing the `DATABASE_URL` configuration.
 * Supported database types include SQLite, PostgresSQL, and MySQL.
 *
 * @return {PrismaClient} A PrismaClient instance configured for the selected database type.
 */
export function createClient(): PrismaClient {
  switch (getDatabaseType()) {
    case DatabaseType.Sqlite:
      return sqliteClient();
    case DatabaseType.PostgresSQL:
      return postgresClient();
    case DatabaseType.MySQL:
      return mysqlClient();
    default:
      return sqliteClient();
  }
}

/**
 * Initializes and returns an instance of the PrismaClient configured with a Better SQLite3 adapter.
 *
 * This method sets up a database connection using the PrismaBetterSqlite3 adapter with the provided
 * database URL and additional options.
 *
 * @return {PrismaClient} A configured instance of PrismaClient for interacting with the SQLite database.
 */
function sqliteClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: config.DATABASE_URL || 'file:./sqlite.db'
  });

  return createPrismaClient(adapter);
}

/**
 * Creates and returns an instance of PrismaClient configured with the specified options.
 *
 * @return {PrismaClient} An instance of PrismaClient used to interact with a PostgresSQL database.
 */
function postgresClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: config.DATABASE_URL
  });

  return createPrismaClient(adapter);
}

/**
 * Initializes and returns an instance of PrismaClient configured to use
 * a MariaDB adapter with the specified database connection settings.
 *
 * @return {PrismaClient} A PrismaClient instance configured for MariaDB.
 */
function mysqlClient(): PrismaClient {
  const dbUrl = new URL(process.env.DATABASE_URL!);
  const adapter = new PrismaMariaDb({
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port || '3306', 10),
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.slice(1),
    connectionLimit: 10
  });

  return createPrismaClient(adapter);
}

/**
 * Creates and returns an instance of PrismaClient configured with the specified SQL driver adapter.
 * The PrismaClient class is loaded from the configured output path relative to the root directory.
 *
 * @param {SqlDriverAdapterFactory} adapter - The SQL driver adapter factory used to configure the PrismaClient.
 * @return {PrismaClient} A configured PrismaClient instance.
 */
function createPrismaClient(adapter: SqlDriverAdapterFactory): PrismaClient {
  const cwd = process.cwd();
  const mainPath = require.main?.filename || process.argv[1];

  const relativeMainPath = mainPath.replace(`${cwd}${path.sep}`, '');
  const distDirName = relativeMainPath.split(path.sep)[0];

  const clientPath = path.join(
    cwd,
    distDirName,
    config.DATABASE_CLIENT_OUTPUT_PATH,
    'client'
  );

  const { PrismaClient } = require(clientPath);

  return new PrismaClient({ adapter, ...options });
}
