import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configOverrides } from '@appweaver/common';

const planMigrations = jest.fn();

jest.mock('../../migrate/plan-migrations', () => ({
  ...jest.requireActual('../../migrate/plan-migrations'),
  planMigrations: (...args: any[]) => planMigrations(...args)
}));
const setupDatabase = jest.fn();

jest.mock('@appweaver/data/internal', () => ({
  setupDatabase: (...args: any[]) => setupDatabase(...args)
}));
// fkill is ESM only, and the tests never kill a process
jest.mock('fkill', () => ({ __esModule: true, default: jest.fn() }));

import {
  printMigrationPlan,
  runDatabaseSetup
} from '../../migrate/migrate-command';

describe('migrate-command', () => {
  let dir: string;
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  const logged = () => log.mock.calls.flat().join('\n');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-migrate-'));
    configOverrides.DATABASE_MIGRATIONS_DIR_PATH = dir;
    planMigrations.mockReset();
    log = jest.spyOn(console, 'log').mockImplementation();
    error = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete configOverrides.DATABASE_MIGRATIONS_DIR_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('printMigrationPlan', () => {
    test('plans the migrations of the configured directory', async () => {
      planMigrations.mockResolvedValue({ status: 'up-to-date' });

      await expect(printMigrationPlan()).resolves.toBe(0);

      expect(planMigrations).toHaveBeenCalledWith(path.resolve(dir));
      expect(logged()).toContain('No pending migrations');
    });

    test('prints the pending migrations with their SQL', async () => {
      fs.mkdirSync(path.join(dir, '1_init'));
      fs.writeFileSync(
        path.join(dir, '1_init', 'migration.sql'),
        'CREATE TABLE "Post" ();\n'
      );
      planMigrations.mockResolvedValue({
        status: 'pending',
        migrations: ['1_init', '2_missing'],
        database: 'managed'
      });

      await expect(printMigrationPlan()).resolves.toBe(0);

      const output = logged();
      expect(output).toContain('2 pending migrations would be applied:');
      expect(output).toContain('-- Migration 1_init\nCREATE TABLE "Post" ();');
      expect(output).toContain(
        '-- Migration 2_missing\n-- migration.sql not found'
      );
      expect(output).toContain('Dry run, the database was not changed.');
    });

    test.each([
      ['missing', 'The database does not exist yet, 1 pending migration'],
      [
        'unmanaged',
        'The database has no migration history, 1 pending migration would be applied if it has no tables:'
      ]
    ])('names a database that is %s', async (database, header) => {
      planMigrations.mockResolvedValue({
        status: 'pending',
        migrations: ['1_init'],
        database
      });

      await printMigrationPlan();

      expect(logged()).toContain(header);
    });

    test('reports no pending migrations of a missing database without any', async () => {
      planMigrations.mockResolvedValue({
        status: 'pending',
        migrations: [],
        database: 'missing'
      });

      await expect(printMigrationPlan()).resolves.toBe(0);

      expect(logged()).toContain('No pending migrations');
    });

    test('prints the output and exit code of a failed status', async () => {
      planMigrations.mockResolvedValue({
        status: 'error',
        code: 1,
        output: 'Error: P3009'
      });

      await expect(printMigrationPlan()).resolves.toBe(1);

      expect(error).toHaveBeenCalledWith('Error: P3009');
    });
  });

  describe('runDatabaseSetup', () => {
    const owner = 'postgresql://owner:secret@localhost:5432/shop';

    beforeEach(() => {
      setupDatabase.mockReset();
    });

    afterEach(() => {
      delete configOverrides.DATABASE_URL;
      delete configOverrides.DATABASE_MIGRATION_URL;
      delete configOverrides.DATABASE_TYPE;
    });

    test('sets up the database with the migration URL', async () => {
      configOverrides.DATABASE_URL = 'postgresql://app:pw@localhost:5432/shop';
      configOverrides.DATABASE_MIGRATION_URL = owner;
      setupDatabase.mockImplementation(async () => {
        expect(configOverrides.DATABASE_URL).toBe(owner);
        return {
          scanPath: dir,
          built: true,
          parts: ['time series hypertables', 'spatial geometry triggers']
        };
      });

      await expect(runDatabaseSetup()).resolves.toBe(0);

      expect(setupDatabase).toHaveBeenCalledTimes(1);
      expect(logged()).toBe(
        'Set up the time series hypertables and spatial geometry triggers.'
      );
    });

    test('prints nothing when the models need no setup', async () => {
      configOverrides.DATABASE_URL = owner;
      setupDatabase.mockResolvedValue({
        scanPath: dir,
        built: true,
        parts: []
      });

      await expect(runDatabaseSetup()).resolves.toBe(0);

      expect(log).not.toHaveBeenCalled();
    });

    test('warns of models not built', async () => {
      configOverrides.DATABASE_URL = owner;
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      setupDatabase.mockResolvedValue({
        scanPath: path.resolve('dist/src'),
        built: false,
        parts: []
      });

      await expect(runDatabaseSetup()).resolves.toBe(0);

      expect(warn.mock.calls[0][0]).toContain(
        `The models are not built in ${path.join('dist', 'src')}`
      );
    });

    test.each([
      ['SQLite', 'file:./data/shop.db'],
      ['MySQL', 'mysql://app:pw@localhost:3306/shop']
    ])('skips a %s database', async (_, url) => {
      configOverrides.DATABASE_URL = url;

      await expect(runDatabaseSetup()).resolves.toBe(0);

      expect(setupDatabase).not.toHaveBeenCalled();
    });

    test('fails with the error of the setup', async () => {
      configOverrides.DATABASE_URL = owner;
      setupDatabase.mockRejectedValue(new Error('no timescaledb extension'));

      await expect(runDatabaseSetup()).resolves.toBe(1);

      expect(error).toHaveBeenCalledWith(
        'The database setup failed: no timescaledb extension'
      );
    });

    test('fails on a migration URL of another database', async () => {
      configOverrides.DATABASE_URL = 'postgresql://app:pw@localhost:5432/shop';
      configOverrides.DATABASE_MIGRATION_URL =
        'postgresql://owner:pw@localhost:5432/other';

      await expect(runDatabaseSetup()).resolves.toBe(1);

      expect(setupDatabase).not.toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toContain('other');
    });
  });
});
