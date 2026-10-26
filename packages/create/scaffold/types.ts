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

export type Runtime = 'node' | 'bun';

/** The properties of a project the module files are generated with. */
export type ProjectContext = {
  /** The package name of the project, naming its containers. */
  name: string;
  /** The host and port the server of the web module listens on. */
  host: string;
  port: number;
  runtime: Runtime;
  /** The database of the data module. */
  database: DatabaseType;
};

/** Thrown for a module selection or a project that cannot be scaffolded. */
export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScaffoldError';
  }
}
