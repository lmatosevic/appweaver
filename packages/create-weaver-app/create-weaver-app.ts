#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Command, InvalidOptionArgumentError } from 'commander';
import { glob } from 'glob';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, './package.json'), 'utf8')
);

/** The versions of the npm packages a new project is generated with. The Appweaver packages are
 * left out, since they follow the version of this package. */
const packageVersions = loadPackageVersions();

const dbTypes = ['sqlite', 'postgresql', 'mysql', 'sqlserver'];

const agentTypes = [
  'claude',
  'codex',
  'junie',
  'cursor',
  'copilot',
  'opencode',
  'kiro',
  'pi',
  'none'
];

const program = new Command();

program
  .name('create-weaver-app')
  .description('Create Weaver App - Bootstrap new Appweaver project')
  .version(pkg.version, '-v, --version', 'Output the current version.')
  .helpOption('-h, --help', 'Output usage information.')
  .usage('<name> [description] [options]')
  .argument('<name>', 'Name of the new project')
  .argument(
    '[description]',
    'Description of the new project',
    'Appweaver project'
  )
  .option(
    '-o, --outputDir [outputDir]',
    'Directory where to generate new project. (default: name of project)'
  )
  .option(
    '--database [database]',
    `Type of SQL database (${dbTypes.join(', ')}).`,
    parseDatabaseType,
    'sqlite'
  )
  .option(
    '--port [port]',
    'Port number where the application server will listen.',
    parsePortNumber,
    5000
  )
  .option(
    '--host [host]',
    'Hostname or IP address where the application server will bind.',
    parseHostname,
    '0.0.0.0'
  )
  .option(
    '--agent [agent]',
    `The AI agent for which to configure guidelines and skill files (${agentTypes.join(', ')}).`,
    parseAgentType,
    'claude'
  )
  .option('--bun', 'Use Bun as application runtime.')
  .option('--skipInstall', 'Skip all dependencies installation.')
  .option('--noDocker', 'Skip copying Dockerfile and docker-compose.yml files.')
  .option(
    '--noRedis',
    'Skip IoRedis package installation and use in-memory cache, rate limit and queue.'
  )
  .option(
    '--noQueue',
    'Skip BullQueue package installation and use in-memory queue.'
  )
  .option(
    '--noMailer',
    'Skip Nodemailer package installation and disable the mailer.'
  )
  .option(
    '--noCron',
    'Skip Cron package installation and disable the scheduler.'
  )
  .action(async (name: string, description: string, _, command: Command) => {
    const directory = command.getOptionValue('outputDir');
    const runtime = command.getOptionValue('bun') ? 'bun' : 'node';
    const packageManager = runtime === 'bun' ? 'bun' : 'npm';

    // Check if bun runtime is installed on this machine
    if (runtime === 'bun') {
      const status = await runProcess('bun', ['--version'], { quiet: true });
      if (status !== 0) {
        console.error('Bun runtime is not installed on this machine.');
        process.exit(1);
      }
    }

    // Sanitize and create a new directory
    const sanitizedName = name
      .replace(/\s+/g, '-')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();

    const projectDir = directory ?? sanitizedName;
    const destDir = path.join(process.cwd(), projectDir);

    // Initialize new project directory
    try {
      await fsp.access(destDir, fs.constants.F_OK);
      console.log(`Using existing directory: ${path.dirname(destDir)}\n`);
    } catch (e) {
      await fsp.mkdir(destDir, { recursive: true });
      console.log(`Created new directory: ${projectDir}\n`);
    }

    console.log('Generating application files...');

    // Copy template contents into a new directory
    const templateDir = path.join(__dirname, './templates/default');
    await fsp.cp(templateDir, destDir, { recursive: true });

    // Remove Docker-related files if --noDocker flag is set
    if (command.getOptionValue('noDocker')) {
      const dockerFiles = [
        'Dockerfile',
        'Dockerfile.bun',
        'docker-compose.yml.tpl'
      ];
      for (const dockerFile of dockerFiles) {
        await fsp.rm(path.join(destDir, dockerFile), { force: true });
      }
    }

    // Build database-specific docker-compose service blocks
    const dockerDb = getDatabaseDockerConfig(command, sanitizedName);
    const dockerRedis = getRedisDockerConfig(command, sanitizedName);

    // Define all variables used in template files with .tpl extension
    const variables: Record<string, string> = {
      NAME: name.charAt(0).toUpperCase() + name.slice(1),
      LOWER_NAME: sanitizedName,
      DESCRIPTION: description,
      HOST: command.getOptionValue('host'),
      PORT: command.getOptionValue('port'),
      DEPENDENCIES: formatDependencies(getNodeDependencies(command, runtime)),
      DEV_DEPENDENCIES: formatDependencies(getNodeDevDependencies(runtime)),
      DATABASE_URL: getDatabaseUrl(command, sanitizedName, 'dev'),
      DATABASE_TEST_URL: getDatabaseUrl(command, sanitizedName, 'test'),
      DATABASE_ENV: getDatabaseEnv(command, sanitizedName),
      DOCKER_APP_ENVIRONMENT: getDockerAppEnvironment(command, sanitizedName),
      DATABASE_DOCKER_SERVICE: dockerDb.service,
      DATABASE_DOCKER_MIGRATE_DEPENDS: dockerDb.migrateDepends,
      DATABASE_DOCKER_APP_VOLUME: dockerDb.appVolume,
      DATABASE_DOCKER_NAMED_VOLUME: dockerDb.namedVolume,
      REDIS_DOCKER_SERVICE: dockerRedis.service,
      REDIS_DOCKER_APP_DEPENDS: dockerRedis.appDepends,
      REDIS_DOCKER_NAMED_VOLUME: dockerRedis.namedVolume,
      VERSION: pkg.version
    };

    // Process .tpl files: replace variables and remove .tpl extension
    const templateFiles = await glob('**/*.tpl', {
      cwd: destDir,
      absolute: true,
      dot: true
    });

    for (const templateFile of templateFiles) {
      let content = await fsp.readFile(templateFile, 'utf8');

      // Replace variables with values, inserted as they are, since a replacement
      // string would read the '$$' escapes of docker-compose as a pattern
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
          () => value
        );
      }

      // Save output to new file and remove template file
      const outputFile = templateFile.replace(/\.tpl$/, '');
      await fsp.writeFile(outputFile, content, 'utf8');
      await fsp.unlink(templateFile);
    }

    // Find all runtime-specific files and keep only those for current runtime
    const runtimeFiles = await glob(`**/*.{node,bun}`, {
      cwd: destDir,
      absolute: true,
      dot: true
    });

    for (const runtimeFile of runtimeFiles) {
      if (runtimeFile.endsWith(`.${runtime}`)) {
        const outputFile = runtimeFile.replace(`.${runtime}`, '');
        await fsp.cp(runtimeFile, outputFile);
      }
      await fsp.unlink(runtimeFile);
    }

    // Configure the modules whose packages are skipped
    const modulesConfig = getModulesConfig(command);
    if (Object.keys(modulesConfig).length > 0) {
      const configFile = path.join(destDir, 'appweaver.json');
      const appConfig = JSON.parse(await fsp.readFile(configFile, 'utf8'));
      Object.assign(appConfig.config, modulesConfig);
      await fsp.writeFile(
        configFile,
        `${JSON.stringify(appConfig, null, 2)}
`,
        'utf8'
      );
    }

    // Create test reports directory
    await fsp.mkdir(path.join(destDir, 'reports'));

    // Create the SQLite database data directory (matches the "data/" DATABASE_URL)
    if (command.getOptionValue('database') === 'sqlite') {
      await fsp.mkdir(path.join(destDir, 'data'), { recursive: true });
    }

    // Add instructions for AI Agents and skill files
    const agent = command.getOptionValue('agent');
    if (agent !== 'none') {
      let agentsDir: string;
      if (['claude', 'junie', 'kiro', 'pi', 'opencode'].includes(agent)) {
        agentsDir = `.${agent}`;
      } else if (agent === 'copilot') {
        agentsDir = '.github';
      } else {
        agentsDir = '.agents';
      }

      const guidelinesFileName = agent === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';

      // Copy skill and referenced files. The framework guidelines
      // (GUIDELINES.md) are preserved inside the skills directory so that
      // `weaver update` can keep them in sync without touching the project's
      // own root guidelines file.
      const skillDir = path.join(__dirname, 'skill');
      const projectSkillPath = path.join(agentsDir, 'skills', 'appweaver');
      const projectSkillDir = path.join(destDir, projectSkillPath);
      await fsp.cp(skillDir, projectSkillDir, {
        recursive: true
      });

      // Create a thin root guidelines file that references the framework
      // guidelines from the skills directory. This file is never overwritten
      // by `weaver update`, so it can be freely extended in the project.
      const guidelinesPath = path
        .join(projectSkillPath, 'GUIDELINES.md')
        .replace(/\\/g, '/');
      const guidelinesFilePath = path.join(destDir, guidelinesFileName);
      const guidelinesReference =
        agent === 'claude'
          ? `@${guidelinesPath}`
          : `[Appweaver framework guidelines](${guidelinesPath})`;
      const guidelinesContent =
        `# ${variables.NAME}\n\n` +
        `${description}\n\n` +
        `This is an [Appweaver](https://github.com/lmatosevic/appweaver) ` +
        `project. Follow the framework conventions, architecture,\n and ` +
        `usage documented in the guidelines:\n\n${guidelinesReference}\n\n` +
        `<!-- Add your own project-specific instructions below this line. -->\n`;
      await fsp.writeFile(guidelinesFilePath, guidelinesContent, {
        encoding: 'utf8'
      });
    }

    console.log(`Done\n`);

    if (command.getOptionValue('skipInstall')) {
      console.log(`${name} created successfully!`);
      return;
    }

    console.log(`Installing dependencies...`);

    await runProcess(
      packageManager,
      ['install', '--no-audit', '--no-fund', '--loglevel=error'],
      { destDir }
    );

    console.log(`Done\n`);

    console.log(`Configuring application...`);

    await runProcess(packageManager, ['run', 'generate'], { destDir });

    console.log(`Done\n`);

    console.log(`${name} created successfully!`);
  })
  .parse();

/**
 * Reads the `scaffoldDependencies` the build injects into the published package.json from the
 * root one. Running from the sources (as the tests do), they are read from the root directly.
 */
function loadPackageVersions(): Record<string, string> {
  const scaffold =
    pkg.scaffoldDependencies ??
    JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
    ).scaffoldDependencies;
  return { ...scaffold.companion, ...scaffold.tooling };
}

function getNodeDependencies(command: Command, runtime: string): string[] {
  const adapters = {
    sqlite:
      runtime === 'bun'
        ? '@prisma/adapter-libsql'
        : '@prisma/adapter-better-sqlite3',
    postgresql: '@prisma/adapter-pg',
    mysql: '@prisma/adapter-mariadb',
    sqlserver: '@prisma/adapter-mssql'
  };

  const database = command.getOptionValue('database');
  const databaseDependency = adapters[database.toLowerCase()];
  if (!databaseDependency) {
    console.error(`Invalid database type: ${database}`);
    process.exit(1);
  }

  const dependencies = [databaseDependency, '@prisma/client', 'prisma'];

  if (!command.getOptionValue('noQueue')) {
    dependencies.push('bullmq');
  }

  if (!command.getOptionValue('noCron')) {
    dependencies.push('cron');
  }

  if (!command.getOptionValue('noRedis')) {
    dependencies.push('ioredis');
  }

  if (!command.getOptionValue('noMailer')) {
    dependencies.push('nodemailer');
  }

  return dependencies;
}

function getNodeDevDependencies(runtime: string): string[] {
  const devDependencies = [
    '@eslint/js',
    '@types/node',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    'eslint',
    'eslint-config-prettier',
    'eslint-plugin-prettier',
    'globals',
    'prettier',
    'typescript',
    'typescript-eslint'
  ];

  // Bun runs the tests itself, Node runs them with Jest
  if (runtime === 'bun') {
    devDependencies.push('@types/bun');
  } else {
    devDependencies.push(
      '@swc/core',
      '@swc/jest',
      '@types/jest',
      'eslint-plugin-jest',
      'jest',
      'jest-junit'
    );
  }

  return devDependencies;
}

/** Formats the packages as the sorted entries of a `package.json` dependencies object. */
function formatDependencies(names: string[]): string {
  return [...names]
    .sort()
    .map((name) => {
      if (!packageVersions[name]) {
        throw new Error(`Missing scaffold dependency version of ${name}`);
      }
      return `    "${name}": "${packageVersions[name]}"`;
    })
    .join(',\n');
}

/** Standard database server ports, also published on the host by docker-compose. */
const databasePorts: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlserver: 1433
};

/** Hostnames of the docker-compose database services. */
const databaseDockerHosts: Record<string, string> = {
  postgresql: 'postgres',
  mysql: 'mysql',
  sqlserver: 'sqlserver'
};

/**
 * Returns the local development credentials of the database server, shared by
 * the connection URLs and the docker-compose database service.
 */
function getDatabaseCredentials(
  database: string,
  name: string
): { user: string; password: string; connectUser: string } {
  if (database === 'sqlserver') {
    // SQL Server rejects an SA password failing its complexity policy
    return { user: 'sa', password: `${name}-Passw0rd`, connectUser: 'sa' };
  }

  // The MariaDB user is granted its own database only, while Prisma Migrate
  // creates the shadow and the test databases, so connect as root
  const connectUser = database === 'mysql' ? 'root' : name;

  return { user: name, password: name, connectUser };
}

function getDatabaseUrl(
  command: Command,
  name: string,
  mode: 'dev' | 'test',
  target: 'host' | 'docker' = 'host'
): string {
  const database = command.getOptionValue('database').toLowerCase();
  const dbName = mode === 'test' ? `${name}-test` : name;

  if (database === 'sqlite') {
    return `file:./${mode === 'test' ? 'temp/' : 'data/'}${dbName}.db`;
  }

  const port = databasePorts[database];
  if (!port) {
    console.error(`Invalid database type: ${database}`);
    process.exit(1);
  }

  const host =
    target === 'docker' ? databaseDockerHosts[database] : 'localhost';

  const { connectUser: user, password } = getDatabaseCredentials(
    database,
    name
  );

  const urls = {
    postgresql: `postgresql://${user}:${password}@${host}:${port}/${dbName}?schema=public`,
    mysql: `mysql://${user}:${password}@${host}:${port}/${dbName}`,
    sqlserver: `sqlserver://${host}:${port};database=${dbName};user=${user};password=${password};trustServerCertificate=true`
  };

  return urls[database];
}

/**
 * Returns the .env variables configuring the docker-compose database service,
 * or nothing when there is no such service.
 */
function getDatabaseEnv(command: Command, name: string): string {
  const database = command.getOptionValue('database').toLowerCase();
  if (database === 'sqlite' || command.getOptionValue('noDocker')) {
    return '';
  }

  const { user, password } = getDatabaseCredentials(database, name);

  return `DB_NAME=${name}\nDB_USER=${user}\nDB_PASSWORD=${password}\n`;
}

/**
 * Returns the environment block of the docker-compose application services,
 * pointing the database and Redis connections at the other containers.
 */
function getDockerAppEnvironment(command: Command, name: string): string {
  const variables: string[] = [];

  if (command.getOptionValue('database').toLowerCase() !== 'sqlite') {
    variables.push(
      `DATABASE_URL: "${getDatabaseUrl(command, name, 'dev', 'docker')}"`
    );
  }

  if (!command.getOptionValue('noRedis')) {
    variables.push('REDIS_URL: "redis://redis:6379/0"');
  }

  if (variables.length === 0) {
    return '';
  }

  return `    environment:\n${variables.map((v) => `      ${v}\n`).join('')}`;
}

/**
 * Returns the configuration of the modules whose packages are skipped. The ones
 * with an in-memory implementation switch to it, the others are disabled.
 */
function getModulesConfig(command: Command): Record<string, object> {
  const modulesConfig: Record<string, object> = {};

  if (command.getOptionValue('noRedis')) {
    modulesConfig.redis = { provider: '@appweaver/core/memory/in-memory' };
    modulesConfig.cache = { provider: '@appweaver/core/cache/memory-cache' };
    modulesConfig.rateLimit = { store: 'in-memory' };
  }

  // BullMQ also needs Redis
  if (command.getOptionValue('noRedis') || command.getOptionValue('noQueue')) {
    modulesConfig.queue = { provider: '@appweaver/core/queue/memory-queue' };
  }

  if (command.getOptionValue('noCron')) {
    modulesConfig.scheduler = { enabled: false };
  }

  if (command.getOptionValue('noMailer')) {
    modulesConfig.mailer = { enabled: false };
  }

  return modulesConfig;
}

function getRedisDockerConfig(
  command: Command,
  name: string
): { service: string; appDepends: string; namedVolume: string } {
  if (command.getOptionValue('noRedis')) {
    return { service: '', appDepends: '', namedVolume: '' };
  }

  return {
    service: `  redis:
    image: redis:7.4.9
    container_name: ${name}-redis
    restart: unless-stopped
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 5s
      start_interval: 5s
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - ${name}

`,
    appDepends: `      redis:
        condition: service_healthy
`,
    namedVolume: `  redis-data:
`
  };
}

function getDatabaseDockerConfig(
  command: Command,
  name: string
): {
  service: string;
  migrateDepends: string;
  appVolume: string;
  namedVolume: string;
} {
  const database = command.getOptionValue('database').toLowerCase();

  // SQLite runs embedded in the application, so there is no database service.
  // The database file is persisted in a named volume shared by the migration,
  // seed, and application containers (see the "data/" DATABASE_URL location).
  if (database === 'sqlite') {
    return {
      service: '',
      migrateDepends: '',
      appVolume: `\n      - sqlite-data:/usr/app/data`,
      namedVolume: `  sqlite-data:\n`
    };
  }

  const services: Record<string, { service: string; volume: string }> = {
    postgresql: {
      service: `  postgres:
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
      POSTGRES_DB: "\${DB_NAME}"
      POSTGRES_USER: "\${DB_USER}"
      POSTGRES_PASSWORD: "\${DB_PASSWORD}"
    volumes:
      - postgres-data:/var/lib/postgresql
    networks:
      - ${name}

`,
      volume: `  postgres-data:\n`
    },
    mysql: {
      service: `  mysql:
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
      MARIADB_DATABASE: "\${DB_NAME}"
      MARIADB_USER: "\${DB_USER}"
      MARIADB_PASSWORD: "\${DB_PASSWORD}"
      MARIADB_ROOT_PASSWORD: "\${DB_PASSWORD}"
    volumes:
      - mysql-data:/var/lib/mysql
    networks:
      - ${name}

`,
      volume: `  mysql-data:\n`
    },
    sqlserver: {
      service: `  sqlserver:
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
      volume: `  sqlserver-data:\n`
    }
  };

  const config = services[database];
  if (!config) {
    console.error(`Invalid database type: ${database}`);
    process.exit(1);
  }

  return {
    service: config.service,
    migrateDepends: `    depends_on:
      ${database === 'postgresql' ? 'postgres' : database}:
        condition: service_healthy
`,
    appVolume: '',
    namedVolume: config.volume
  };
}

function runProcess(
  cmd: string,
  args: string[] = [],
  params: { destDir?: string; quiet?: boolean } = {}
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const { destDir, quiet } = params;
    const command = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
    const child = spawn(command, {
      stdio: quiet ? 'ignore' : 'inherit',
      shell: true,
      cwd: destDir
    });

    child.on('error', reject);

    child.on('close', (code) => {
      resolve(code);
    });
  });
}

function parseDatabaseType(value: string): string {
  const lowerDbType = value.toLowerCase();
  if (!dbTypes.includes(lowerDbType)) {
    throw new InvalidOptionArgumentError(
      `Must be one of following: ${dbTypes.join(', ')}.`
    );
  }

  return lowerDbType;
}

function parsePortNumber(value: string): number {
  const int = parseInt(value, 10);
  if (isNaN(int) || int < 0 || int > 65535) {
    throw new InvalidOptionArgumentError(
      'Must be an integer between 0 and 65535.'
    );
  }

  return int;
}

function parseHostname(value: string): string {
  try {
    new URL(`http://${value}`);
  } catch {
    throw new InvalidOptionArgumentError(
      'Must be a valid hostname or IP address.'
    );
  }

  return value;
}

function parseAgentType(value: string): string {
  const lowerAgentType = value.toLowerCase();
  if (!agentTypes.includes(lowerAgentType)) {
    throw new InvalidOptionArgumentError(
      `Must be one of following: ${agentTypes.join(', ')}.`
    );
  }

  return lowerAgentType;
}
