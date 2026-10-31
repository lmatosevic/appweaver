import { InvalidOptionArgumentError } from 'commander';

export const moduleNames = [
  'data',
  'web',
  'redis',
  'queue',
  'scheduler',
  'mailer',
  'templates',
  'locales',
  'docker'
] as const;

/** An optional module of a project, listed in the order the modules are applied. */
export type ModuleName = (typeof moduleNames)[number];

export const databaseTypes = [
  'sqlite',
  'postgresql',
  'mysql',
  'sqlserver'
] as const;

export type DatabaseType = (typeof databaseTypes)[number];

/**
 * Parses the `--database` option of `create-appweaver` and `weaver module add`, a Commander argument parser.
 *
 * @param {string} value - The option value, in any case.
 * @return {DatabaseType} The database.
 * @throws {InvalidOptionArgumentError} When the value is not a database.
 */
export function parseDatabaseType(value: string): DatabaseType {
  const database = value.toLowerCase() as DatabaseType;
  if (!databaseTypes.includes(database)) {
    throw new InvalidOptionArgumentError(
      `Must be one of following: ${databaseTypes.join(', ')}.`
    );
  }
  return database;
}

export type Runtime = 'node' | 'bun';

/** The properties of a project the module files are generated with. */
export type ProjectContext = {
  /** The package name of the project, naming its containers. */
  name: string;
  /** The port the server of the web module listens on. */
  port: number;
  runtime: Runtime;
  /** The database of the data module. */
  database: DatabaseType;
  /** The host the server of the web module binds to. Default: `'0.0.0.0'`. */
  host?: string;
};

/** Thrown for a module selection or a project that cannot be scaffolded. */
export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScaffoldError';
  }
}
