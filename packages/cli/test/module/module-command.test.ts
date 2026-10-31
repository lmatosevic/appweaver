const runProcess = jest.fn<Promise<number>, any[]>();

jest.mock('../../utils', () => ({
  runProcess: (...args: any[]) => runProcess(...args)
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { createProject } from '@appweaver/create/scaffold';
import { moduleCommand } from '../../module';

describe('module-command', () => {
  let dir: string;
  let originalCwd: string;
  let logs: string[];
  let errors: string[];

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-module-'));
    await createProject({
      dir,
      name: 'MyApp',
      packageName: 'my-app',
      description: 'My description',
      host: '0.0.0.0',
      port: 5000,
      database: 'postgresql',
      runtime: 'node',
      modules: ['docker']
    });
    process.chdir(dir);

    logs = [];
    errors = [];
    jest.spyOn(console, 'log').mockImplementation((...parts: any[]) => {
      logs.push(parts.join(' '));
    });
    jest.spyOn(console, 'warn').mockImplementation((...parts: any[]) => {
      logs.push(parts.join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation((...parts: any[]) => {
      errors.push(parts.join(' '));
    });
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    runProcess.mockReset();
    runProcess.mockResolvedValue(0);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const run = (...args: string[]) => {
    const program = new Command('weaver');
    moduleCommand(program);
    return program.parseAsync(['module', ...args], { from: 'user' });
  };

  const readJson = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

  describe('module list', () => {
    test('lists the modules with their status', async () => {
      await run('list');

      expect(logs[0]).toMatch(/^Module\s+Status\s+Packages\s+Requires/);
      expect(logs.find((line) => line.startsWith('docker'))).toMatch(
        /^docker\s+enabled/
      );
      expect(logs.find((line) => line.startsWith('queue'))).toMatch(
        /^queue\s+disabled\s+@appweaver\/bullmq\s+redis/
      );
    });
  });

  describe('module new', () => {
    test('creates a local module', async () => {
      await run('new', 'billing');

      expect(fs.existsSync('src/modules/billing/module.ts')).toBe(true);
      expect(logs).toContain(`  ${path.join('src/modules/billing/main.ts')}`);
    });

    test('rejects an invalid module name', async () => {
      await expect(run('new', 'Billing')).rejects.toThrow('process.exit(1)');
      expect(errors[0]).toContain('kebab-case');
    });
  });

  describe('module add', () => {
    test('installs a module package without running its scripts', async () => {
      await run('add', '@acme/appweaver-gcs');

      expect(runProcess).toHaveBeenCalledWith(
        'npm',
        ['install', '--ignore-scripts', '@acme/appweaver-gcs'],
        expect.any(Object)
      );
      expect(logs).toContain('Package @acme/appweaver-gcs is not installed.');
    });

    test('only adds a module package to package.json without the installation', async () => {
      await run('add', '@acme/appweaver-gcs', '--no-install');

      expect(runProcess).toHaveBeenCalledWith(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--package-lock-only',
          '@acme/appweaver-gcs'
        ],
        expect.any(Object)
      );
      expect(logs).toContain(
        'Added @acme/appweaver-gcs to package.json, run "npm install" to enable the modules.'
      );
    });

    test('adds the modules with the ones they require and installs them', async () => {
      await run('add', 'queue');

      expect(logs).toContain('Adding module redis, required by queue.');
      expect(logs).toContain('  update  docker-compose.yml');
      expect(logs).toContain('\nAdded modules: redis, queue');
      expect(readJson('package.json').dependencies).toMatchObject({
        '@appweaver/bullmq': expect.any(String),
        '@appweaver/redis': expect.any(String)
      });
      expect(
        fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
      ).toContain('image: redis:7.4.9');
      expect(runProcess).toHaveBeenCalledWith('npm', ['install'], {
        quiet: true
      });
    });

    test('prints the changes of a dry run without applying them', async () => {
      await run('add', 'templates', 'mailer', '--dry-run');

      expect(logs).toContain('Changes that would be made:');
      expect(logs).toContain(
        '  create  templates/emails/verify-email.html.hbs'
      );
      expect(fs.existsSync(path.join(dir, 'templates'))).toBe(false);
      expect(readJson('package.json').dependencies).not.toHaveProperty(
        '@appweaver/handlebars'
      );
      expect(runProcess).not.toHaveBeenCalled();
    });

    test('skips the installation without changed dependencies', async () => {
      await run('add', 'locales');

      expect(fs.existsSync(path.join(dir, 'locales', 'en.json'))).toBe(true);
      expect(runProcess).not.toHaveBeenCalled();
    });

    test('skips the installation with the no-install flag', async () => {
      await run('add', 'mailer', '--no-install');

      expect(readJson('package.json').dependencies).toHaveProperty(
        '@appweaver/nodemailer'
      );
      expect(runProcess).not.toHaveBeenCalled();
    });

    test('adds the data module with the database of the option', async () => {
      await run('add', 'data', '--database', 'mysql');

      expect(readJson('package.json').dependencies).toHaveProperty(
        '@prisma/adapter-mariadb'
      );
      expect(readJson('appweaver.json').config.database.url).toContain(
        'mysql://'
      );
      expect(
        fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
      ).toContain('image: mariadb:11.4');
    });

    test('adds the data module with SQLite by default', async () => {
      await run('add', 'web');

      expect(logs).toContain('Adding module data, required by web.');
      expect(readJson('appweaver.json').config.database.url).toBe(
        'file:./data/my-app.db'
      );
    });

    test('rejects a database option of an enabled data module', async () => {
      await run('add', 'data');

      await expect(run('add', 'redis', '--database', 'mysql')).rejects.toThrow(
        'process.exit(1)'
      );
      expect(errors[0]).toBe(
        'Module data is already enabled with the sqlite database.'
      );
    });

    test('ignores the database option without the data module', async () => {
      await run('add', 'scheduler', '--database', 'mysql', '--no-install');

      expect(logs).toContain(
        'Ignoring --database, the data module it configures is not added.'
      );
      expect(readJson('package.json').dependencies).not.toHaveProperty(
        '@prisma/adapter-mariadb'
      );
    });

    test('rejects an unknown database', async () => {
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);

      await expect(run('add', 'data', '--database', 'oracle')).rejects.toThrow(
        'process.exit(1)'
      );
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining(
          'Must be one of following: sqlite, postgresql, mysql, sqlserver.'
        )
      );
    });

    test('reports the enabled modules', async () => {
      await run('add', 'docker');

      expect(logs).toEqual(['Module docker is already enabled.']);
    });

    test('rejects an unknown module', async () => {
      await expect(run('add', 'graphql')).rejects.toThrow('process.exit(1)');

      expect(errors[0]).toContain('Unknown module: graphql.');
    });

    test('exits when the installation fails', async () => {
      runProcess.mockResolvedValue(1);

      await expect(run('add', 'redis')).rejects.toThrow('process.exit(1)');
      expect(errors[0]).toContain('Installing the dependencies failed');
    });
  });

  describe('module remove', () => {
    test('removes the modules with their files', async () => {
      await run('remove', 'docker');

      expect(logs).toContain('  delete  Dockerfile');
      expect(logs).toContain('\nRemoved modules: docker');
      expect(fs.existsSync(path.join(dir, 'Dockerfile'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'docker-compose.yml'))).toBe(false);
      expect(runProcess).not.toHaveBeenCalled();
    });

    test('rejects removing a module a remaining one requires', async () => {
      await run('add', 'queue', '--no-install');

      await expect(run('rm', 'redis')).rejects.toThrow('process.exit(1)');
      expect(errors).toEqual([
        'Module queue requires redis, remove queue as well.'
      ]);
      expect(readJson('package.json').dependencies).toHaveProperty(
        '@appweaver/redis'
      );
    });

    test('reports the disabled modules', async () => {
      await run('remove', 'mailer');

      expect(logs).toEqual(['Module mailer is not enabled.']);
    });
  });
});
