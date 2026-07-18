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

const prismaVersion = '7.8.0';

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
  .option('--noRedis', 'Skip IoRedis package installation.')
  .option('--noQueue', 'Skip BullQueue package installation.')
  .option('--noMailer', 'Skip Nodemailer package installation.')
  .option('--noCron', 'Skip Cron package installation.')
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

    // Define all variables used in template files with .tpl extension
    const variables: Record<string, string> = {
      NAME: name.charAt(0).toUpperCase() + name.slice(1),
      LOWER_NAME: sanitizedName,
      DESCRIPTION: description,
      HOST: command.getOptionValue('host'),
      PORT: command.getOptionValue('port'),
      DEPENDENCIES: getNodeDependencies(command, runtime).join(',\n'),
      DATABASE_URL: getDatabaseUrl(command, sanitizedName, 'dev'),
      DATABASE_TEST_URL: getDatabaseUrl(command, sanitizedName, 'test'),
      DATABASE_DOCKER_SERVICE: dockerDb.service,
      DATABASE_DOCKER_MIGRATE_DEPENDS: dockerDb.migrateDepends,
      DATABASE_DOCKER_SQLITE_VOLUMES: dockerDb.sqliteVolumes,
      DATABASE_DOCKER_APP_VOLUME: dockerDb.appVolume,
      DATABASE_DOCKER_NAMED_VOLUME: dockerDb.namedVolume,
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

      // Replace variables with values
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
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

      // Copy skill and referenced files
      const skillDir = path.join(__dirname, 'skill');
      const projectSkillPath = path.join(agentsDir, 'skills', 'appweaver');
      const projectSkillDir = path.join(destDir, projectSkillPath);
      await fsp.cp(skillDir, projectSkillDir, {
        recursive: true
      });

      // Move the project guidelines file to the project root
      const guidelinesSkillPath = path.join(projectSkillDir, 'GUIDELINES.md');
      const guidelinesFilePath = path.join(destDir, guidelinesFileName);
      await fsp.rename(guidelinesSkillPath, guidelinesFilePath);

      // Update project guidelines reference paths to point in skills directory
      const guidelinesContents = await fsp.readFile(guidelinesFilePath, 'utf8');
      const referencesPath = path
        .join(projectSkillPath, 'references')
        .replace(/\\/g, '/');
      const updatedGuidelinesContent = guidelinesContents.replace(
        /(\[.+]\()references\/(.+\))/g,
        `$1${referencesPath}/$2`
      );
      await fsp.writeFile(guidelinesFilePath, updatedGuidelinesContent, {
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

function getNodeDependencies(command: Command, runtime: string): string[] {
  const dependencies: string[] = [];

  const adapters = {
    sqlite:
      runtime === 'bun'
        ? `"@prisma/adapter-libsql": "${prismaVersion}"`
        : `"@prisma/adapter-better-sqlite3": "${prismaVersion}"`,
    postgresql: `"@prisma/adapter-pg": "${prismaVersion}"`,
    mysql: `"@prisma/adapter-mariadb": "${prismaVersion}"`,
    sqlserver: `"@prisma/adapter-mssql": "${prismaVersion}"`
  };

  const database = command.getOptionValue('database');
  const databaseDependency = adapters[database.toLowerCase()];
  if (!databaseDependency) {
    console.error(`Invalid database type: ${database}`);
    process.exit(1);
  }

  dependencies.push(databaseDependency);

  dependencies.push(`"@prisma/client": "${prismaVersion}"`);
  dependencies.push(`"prisma": "${prismaVersion}"`);

  if (!command.getOptionValue('noQueue')) {
    dependencies.push('"bullmq": "5.79.1"');
  }

  if (!command.getOptionValue('noCron')) {
    dependencies.push('"cron": "4.4.0"');
  }

  if (!command.getOptionValue('noRedis')) {
    dependencies.push('"ioredis": "5.11.1"');
  }

  if (!command.getOptionValue('noMailer')) {
    dependencies.push('"nodemailer": "9.0.1"');
  }

  return dependencies.sort().map((d) => `    ${d}`);
}

function getDatabaseUrl(
  command: Command,
  name: string,
  mode: 'dev' | 'test'
): string {
  const dbName = mode === 'test' ? `${name}-test` : name;
  const urls = {
    sqlite: `file:./${mode === 'test' ? 'temp/' : 'data/'}${dbName}.db`,
    postgresql: `postgresql://${name}:${name}@localhost:5432/${dbName}?schema=public`,
    mysql: `mysql://${name}:${name}@localhost:3306/${dbName}`,
    sqlserver: `sqlserver://localhost:1433;database=${dbName};user=${name};password=${name};trustServerCertificate=true`
  };

  const database = command.getOptionValue('database');
  const databaseUrl = urls[database.toLowerCase()];
  if (!databaseUrl) {
    console.error(`Invalid database type: ${database}`);
    process.exit(1);
  }

  return databaseUrl;
}

function getDatabaseDockerConfig(
  command: Command,
  name: string
): {
  service: string;
  migrateDepends: string;
  sqliteVolumes: string;
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
      sqliteVolumes: `    volumes:\n      - sqlite-data:/usr/app/data\n`,
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
      - "127.0.0.1:5433:5432"
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
    image: mysql:8.4
    container_name: ${name}-mysql
    restart: unless-stopped
    healthcheck:
      test: [ "CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-u", "root", "-p$$MYSQL_ROOT_PASSWORD" ]
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 5s
      start_interval: 5s
    ports:
      - "127.0.0.1:3307:3306"
    environment:
      MYSQL_DATABASE: "\${DB_NAME}"
      MYSQL_USER: "\${DB_USER}"
      MYSQL_PASSWORD: "\${DB_PASSWORD}"
      MYSQL_ROOT_PASSWORD: "\${DB_PASSWORD}"
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
      - "127.0.0.1:1434:1433"
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
    sqliteVolumes: '',
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
