import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { config, DatabaseType } from '@appweaver/common';
import { PrismaClient } from '@prisma/client';

const options = {
  transactionOptions: {
    maxWait: config.DATABASE_TRANSACTION_MAX_WAIT,
    timeout: config.DATABASE_TRANSACTION_TIMEOUT
  }
};

/**
 * Creates and returns a database client based on the configured database type.
 *
 * The method selects the appropriate client based on the `DATABASE_URL` value in the configuration:
 * - If the database type is PostgresSQL, it returns a PostgresSQL client.
 * - If the database type is SQLite, it returns an SQLite client.
 * - Defaults to returning an SQLite client if no match is found.
 *
 * @return {Object} The database client object for the specified or default database type.
 */
export function createClient(): PrismaClient {
  switch (config.DATABASE_URL) {
    case DatabaseType.PostgresSQL:
      return postgresClient();
    case DatabaseType.Sqlite:
      return sqliteClient();
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
    url: config.DATABASE_URL
  });
  return new PrismaClient({ adapter, ...options });
}

/**
 * Creates and returns an instance of PrismaClient configured with the specified options.
 *
 * @return {PrismaClient} An instance of PrismaClient used to interact with a PostgresSQL database.
 */
function postgresClient(): PrismaClient {
  return new PrismaClient(options);
}
