import type { DatabaseType, Runtime } from './types';

/** The Prisma driver adapter packages of the databases. */
export function getDatabaseAdapter(
  database: DatabaseType,
  runtime: Runtime
): string {
  const adapters: Record<DatabaseType, string> = {
    sqlite:
      runtime === 'bun'
        ? '@prisma/adapter-libsql'
        : '@prisma/adapter-better-sqlite3',
    postgresql: '@prisma/adapter-pg',
    mysql: '@prisma/adapter-mariadb',
    sqlserver: '@prisma/adapter-mssql'
  };
  return adapters[database];
}

/** Resolves the database of a project from the Prisma driver adapter it depends on. */
export function detectDatabase(
  dependencies: Record<string, string>
): DatabaseType | undefined {
  const adapters: Record<string, DatabaseType> = {
    '@prisma/adapter-better-sqlite3': 'sqlite',
    '@prisma/adapter-libsql': 'sqlite',
    '@prisma/adapter-pg': 'postgresql',
    '@prisma/adapter-mariadb': 'mysql',
    '@prisma/adapter-mssql': 'sqlserver'
  };
  const adapter = Object.keys(adapters).find((name) => dependencies[name]);
  return adapter ? adapters[adapter] : undefined;
}

/** Standard database server ports, also published on the host by docker-compose. */
const databasePorts: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlserver: 1433
};

/**
 * Returns the local development credentials of the database server, shared by
 * the connection URLs and the docker-compose database service.
 */
function getDatabaseCredentials(
  database: DatabaseType,
  name: string
): { user: string; password: string } {
  if (database === 'sqlserver') {
    // SQL Server rejects an SA password failing its complexity policy
    return { user: 'sa', password: `${name}-Passw0rd` };
  }

  return { user: name, password: name };
}

/**
 * Returns the appweaver.json database URL. A database server URL references
 * the credentials of the .env file, and the `DB_HOST` the containers override.
 */
export function getDatabaseUrl(
  database: DatabaseType,
  name: string,
  mode: 'dev' | 'test'
): string {
  if (database === 'sqlite') {
    return mode === 'test'
      ? `file:./temp/${name}-test.db`
      : `file:./data/${name}.db`;
  }

  const port = databasePorts[database];
  const dbName = `\${DB_NAME:-${name}}${mode === 'test' ? '-test' : ''}`;
  const host = '${DB_HOST:-localhost}';
  const user = `\${DB_USER:-${getDatabaseCredentials(database, name).user}}`;

  const urls = {
    postgresql: `postgresql://${user}:\${DB_PASSWORD}@${host}:${port}/${dbName}`,
    mysql: `mysql://${user}:\${DB_PASSWORD}@${host}:${port}/${dbName}`,
    sqlserver: `sqlserver://${host}:${port};database=${dbName};user=${user};password=\${DB_PASSWORD};trustServerCertificate=true`
  };

  return urls[database];
}

/**
 * Returns the .env database password, referenced by the appweaver.json URL and
 * shared with the docker-compose database service.
 */
export function getSecretsEnv(database: DatabaseType, name: string): string {
  if (database === 'sqlite') {
    return '';
  }

  const { password } = getDatabaseCredentials(database, name);

  return `\n# Secrets referenced by the \${VAR} placeholders of the appweaver.json files\nDB_PASSWORD=${password}\n`;
}

/** Returns the .gitignore rules of the SQLite database files, kept in "data/". */
export function getSqliteGitignore(database: DatabaseType): string {
  if (database !== 'sqlite') {
    return '';
  }

  return '# Local SQLite database files\n/data/*.db\n/data/*.db-*\n\n';
}

/** The docker-compose.yml service of a database server. */
export type DatabaseDockerService = {
  /** The service name, the hostname of the database. */
  host: string;
  /** The YAML of the service. */
  service: string;
  /** The named volume of its data. */
  volume: string;
};

/**
 * Returns the docker-compose.yml service of the database server, or `undefined` for SQLite, which runs embedded in
 * the application, with its file in a named volume shared by the application services.
 */
export function getDatabaseDockerService(
  database: DatabaseType,
  name: string
): DatabaseDockerService | undefined {
  switch (database) {
    case 'sqlite':
      return undefined;
    case 'postgresql':
      return {
        host: 'postgres',
        service: `postgres:
  image: postgres:18.4
  container_name: ${name}-postgres
  restart: unless-stopped
  healthcheck:
    test: "PGPASSWORD=$$POSTGRES_PASSWORD psql -U $$POSTGRES_USER -d $$POSTGRES_DB -c 'SELECT 1'"
    interval: 30s
    timeout: 10s
    retries: 10
    start_period: 5s
    start_interval: 5s
  ports:
    - "127.0.0.1:5432:5432"
  environment:
    POSTGRES_DB: "\${DB_NAME:-${name}}"
    POSTGRES_USER: "\${DB_USER:-${name}}"
    POSTGRES_PASSWORD: "\${DB_PASSWORD}"
  volumes:
    - postgres-data:/var/lib/postgresql
  networks:
    - ${name}
`,
        volume: 'postgres-data'
      };
    case 'mysql':
      return {
        host: 'mysql',
        service: `mysql:
  image: mariadb:11.4
  container_name: ${name}-mysql
  restart: unless-stopped
  healthcheck:
    test: [ "CMD", "healthcheck.sh", "--connect", "--innodb_initialized" ]
    interval: 30s
    timeout: 10s
    retries: 10
    start_period: 5s
    start_interval: 5s
  ports:
    - "127.0.0.1:3306:3306"
  environment:
    MARIADB_DATABASE: "\${DB_NAME:-${name}}"
    MARIADB_USER: "\${DB_USER:-${name}}"
    MARIADB_PASSWORD: "\${DB_PASSWORD}"
    MARIADB_ROOT_PASSWORD: "\${DB_PASSWORD}"
  volumes:
    - mysql-data:/var/lib/mysql
    - ./database/mariadb-init.sh:/docker-entrypoint-initdb.d/mariadb-init.sh:ro
  networks:
    - ${name}
`,
        volume: 'mysql-data'
      };
    case 'sqlserver':
      return {
        host: 'sqlserver',
        service: `sqlserver:
  image: mcr.microsoft.com/mssql/server:2022-latest
  container_name: ${name}-sqlserver
  restart: unless-stopped
  healthcheck:
    test: [ "CMD-SHELL", "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P \\"$$MSSQL_SA_PASSWORD\\" -C -Q 'SELECT 1' || exit 1" ]
    interval: 30s
    timeout: 10s
    retries: 10
    start_period: 10s
    start_interval: 5s
  ports:
    - "127.0.0.1:1433:1433"
  environment:
    ACCEPT_EULA: "Y"
    MSSQL_SA_PASSWORD: "\${DB_PASSWORD}"
  volumes:
    - sqlserver-data:/var/opt/mssql
  networks:
    - ${name}
`,
        volume: 'sqlserver-data'
      };
  }
}
