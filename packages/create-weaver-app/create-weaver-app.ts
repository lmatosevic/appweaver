#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { glob } from 'glob';
import { Command } from 'commander';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, './package.json'), 'utf8')
);

const program = new Command();

program
  .name('create-weaver-app')
  .description('Create Weaver App - Bootstrap new Appweaver project')
  .version(pkg.version, '-v, --version', 'Output the current version.')
  .usage('<command> [options]')
  .helpOption('-h, --help', 'Output usage information.')
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
    '-d, --database [database]',
    'Type of SQL database (options: sqlite, postgresql, mysql, sqlserver).',
    'sqlite'
  )
  .option('--noRedis', 'Skip IoRedis package installation.', false)
  .option('--noQueue', 'Skip BullQueue package installation.', false)
  .option('--noMailer', 'Skip Nodemailer package installation.', false)
  .option('--noCron', 'Skip Cron package installation.', false)
  .action(async (name: string, description: string, _, command: Command) => {
    const directory = command.getOptionValue('outputDir');

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
      console.log(`Using existing directory: ${path.dirname(destDir)}`);
    } catch (e) {
      await fsp.mkdir(destDir, { recursive: true });
      console.log(`Created new directory: ${projectDir}\n`);
    }

    // Copy template contents into a new directory
    const templateDir = path.join(__dirname, './templates/default');
    await fsp.cp(templateDir, destDir, { recursive: true });

    console.log('Generating application files...');

    const variables: Record<string, string> = {
      NAME: name.charAt(0).toUpperCase() + name.slice(1),
      LOWER_NAME: sanitizedName,
      DESCRIPTION: description,
      DEPENDENCIES: getNodeDependencies(command).join(',\n'),
      DATABASE_URL: getDatabaseUrl(command, sanitizedName),
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

    console.log(`Done\n`);

    console.log(`Installing dependencies...`);

    await runProcess('npm', ['install'], destDir);

    console.log(`Done\n`);

    console.log(`Configuring application...`);

    await runProcess('npm', ['run', 'generate'], destDir);

    console.log(`Done\n`);

    console.log(`${sanitizedName} created successfully!`);
  })
  .parse();

function getNodeDependencies(command: Command): string[] {
  const dependencies: string[] = [];

  const adapters = {
    sqlite: '"@prisma/adapter-better-sqlite3": "7.5.0"',
    postgresql: '"@prisma/adapter-pg": "7.5.0"',
    mysql: '"@prisma/adapter-mariadb": "7.5.0"',
    sqlserver: '"@prisma/adapter-mssql": "7.5.0"'
  };

  const database = command.getOptionValue('database');
  const databaseDependency = adapters[database.toLowerCase()];
  if (!databaseDependency) {
    console.error(`Invalid database type: ${database}`);
    process.exit(1);
  }

  dependencies.push(databaseDependency);

  if (!command.getOptionValue('noQueue')) {
    dependencies.push('"bullmq": "5.70.1"');
  }

  if (!command.getOptionValue('noCron')) {
    dependencies.push('"cron": "4.4.0"');
  }

  if (!command.getOptionValue('noRedis')) {
    dependencies.push('"ioredis": "5.9.3"');
  }

  if (!command.getOptionValue('noMailer')) {
    dependencies.push('"nodemailer": "8.0.1"');
  }

  return dependencies.map((d) => `    ${d}`);
}

function getDatabaseUrl(command: Command, name: string): string {
  const urls = {
    sqlite: `file:./${name}.db`,
    postgresql: `postgresql://${name}:${name}@localhost:5432/${name}?schema=public`,
    mysql: `mysql://${name}:${name}@localhost:3306/${name}`,
    sqlserver: `sqlserver://localhost:1433;database=${name};user=${name};password=${name};trustServerCertificate=true`
  };

  const database = command.getOptionValue('database');
  const databaseUrl = urls[database.toLowerCase()];
  if (!databaseUrl) {
    console.error(`Invalid database type: ${database}`);
    process.exit(1);
  }

  return databaseUrl;
}

function runProcess(
  cmd: string,
  args: string[] = [],
  cwd?: string
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const command = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
    const child = spawn(command, { stdio: 'ignore', shell: true, cwd });

    child.on('error', reject);

    child.on('close', (code) => {
      resolve(code);
    });
  });
}
