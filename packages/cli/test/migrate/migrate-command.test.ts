import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configOverrides } from '@appweaver/common';

const planMigrations = jest.fn();

jest.mock('../../migrate/plan-migrations', () => ({
  ...jest.requireActual('../../migrate/plan-migrations'),
  planMigrations: (...args: any[]) => planMigrations(...args)
}));
// fkill is ESM only, and the tests never kill a process
jest.mock('fkill', () => ({ __esModule: true, default: jest.fn() }));

import { printMigrationPlan } from '../../migrate/migrate-command';

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
        databaseMissing: false
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

    test('names a database that does not exist yet', async () => {
      planMigrations.mockResolvedValue({
        status: 'pending',
        migrations: ['1_init'],
        databaseMissing: true
      });

      await printMigrationPlan();

      expect(logged()).toContain(
        'The database does not exist yet, 1 migration would be applied:'
      );
    });

    test('reports no pending migrations of a missing database without any', async () => {
      planMigrations.mockResolvedValue({
        status: 'pending',
        migrations: [],
        databaseMissing: true
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
});
