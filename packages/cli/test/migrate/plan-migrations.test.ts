import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runProcessOutput = jest.fn<
  Promise<{ code: number; stdout: string; stderr: string }>,
  any[]
>();

jest.mock('../../utils', () => ({
  runProcessOutput: (...args: any[]) => runProcessOutput(...args)
}));

import {
  pendingMigrationNames,
  planMigrations,
  readMigrations
} from '../../migrate/plan-migrations';

const pendingOutput = `Datasource "db": SQLite database "dev.db" at "file:./dev.db"

2 migrations found in prisma/migrations
Following migrations have not yet been applied:
20261101000000_init
20261102000000_add_post

To apply migrations in development run prisma migrate dev.
To apply migrations in production run prisma migrate deploy.
`;

/** The error output of the status, with the diagnosis of the schema engine in its debug log. */
const debugLog = (diagnosis: Record<string, unknown>) =>
  `Loaded Prisma config from prisma.config.ts.

prisma:migrate:status {
  "diagnoseResult": ${JSON.stringify(JSON.stringify(diagnosis, null, 2))}
} +497ms
prisma:migrate:status {
  "listMigrationDirectoriesResult": {
    "migrations": []
  }
} +1ms
`;

describe('plan-migrations', () => {
  let dir: string;

  const migration = (name: string, sql: string) => {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'migration.sql'), sql);
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-migrations-'));
    runProcessOutput.mockReset();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('pendingMigrationNames', () => {
    test('reads the names listed as not yet applied', () => {
      expect(pendingMigrationNames(pendingOutput)).toEqual([
        '20261101000000_init',
        '20261102000000_add_post'
      ]);
    });

    test('reads a single pending migration', () => {
      expect(
        pendingMigrationNames(
          'Following migration have not yet been applied:\r\n1_init\r\n'
        )
      ).toEqual(['1_init']);
    });

    test('finds none in the output of an up to date database', () => {
      expect(pendingMigrationNames('Database schema is up to date!')).toEqual(
        []
      );
    });
  });

  describe('planMigrations', () => {
    test('runs prisma migrate status with its debug log', async () => {
      runProcessOutput.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

      await planMigrations(dir);

      expect(runProcessOutput).toHaveBeenCalledWith(
        'prisma',
        ['migrate', 'status'],
        { DEBUG: 'prisma:migrate:status', DEBUG_COLORS: 'false' }
      );
    });

    test('reports an up to date database', async () => {
      runProcessOutput.mockResolvedValue({
        code: 0,
        stdout: 'Database schema is up to date!',
        stderr: ''
      });

      await expect(planMigrations(dir)).resolves.toEqual({
        status: 'up-to-date'
      });
    });

    test('lists the pending migrations', async () => {
      runProcessOutput.mockResolvedValue({
        code: 1,
        stdout: pendingOutput,
        stderr: ''
      });

      await expect(planMigrations(dir)).resolves.toEqual({
        status: 'pending',
        migrations: ['20261101000000_init', '20261102000000_add_post'],
        database: 'managed'
      });
    });

    test('tells a database without a migration history', async () => {
      runProcessOutput.mockResolvedValue({
        code: 1,
        stdout: pendingOutput,
        stderr: debugLog({
          failedMigrationNames: [],
          hasMigrationsTable: false
        })
      });

      await expect(planMigrations(dir)).resolves.toMatchObject({
        status: 'pending',
        database: 'unmanaged'
      });
    });

    test('fails on a failed migration the status leaves out while others are pending', async () => {
      runProcessOutput.mockResolvedValue({
        code: 1,
        stdout: pendingOutput,
        stderr: debugLog({
          failedMigrationNames: ['20261031000000_bad'],
          hasMigrationsTable: true
        })
      });

      await expect(planMigrations(dir)).resolves.toEqual({
        status: 'error',
        code: 1,
        output:
          'Following migration have failed:\n20261031000000_bad\n\n' +
          'No migration is applied until they are resolved, see https://pris.ly/d/migrate-resolve'
      });
    });

    test('relies on the output alone without a readable debug log', async () => {
      runProcessOutput.mockResolvedValue({
        code: 1,
        stdout: pendingOutput,
        stderr:
          'prisma:migrate:status {\n  "diagnoseResult": "{broken"\n} +1ms\n'
      });

      await expect(planMigrations(dir)).resolves.toMatchObject({
        status: 'pending',
        database: 'managed'
      });
    });

    test('lists every migration of the directory for a missing database', async () => {
      migration('2_add_post', '');
      migration('1_init', '');
      fs.writeFileSync(path.join(dir, 'migration_lock.toml'), '');
      runProcessOutput.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Error: P1003: Database `dev.db` does not exist'
      });

      await expect(planMigrations(dir)).resolves.toEqual({
        status: 'pending',
        migrations: ['1_init', '2_add_post'],
        database: 'missing'
      });
    });

    test('lists no migrations for a missing database and directory', async () => {
      runProcessOutput.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Error: P1003: Database `dev.db` does not exist'
      });

      await expect(
        planMigrations(path.join(dir, 'missing'))
      ).resolves.toMatchObject({ status: 'pending', migrations: [] });
    });

    test('returns the output of any other failure, without the debug log', async () => {
      runProcessOutput.mockResolvedValue({
        code: 1,
        stdout: '1 migration found in prisma/migrations\n',
        stderr:
          debugLog({ failedMigrationNames: ['1_init'] }) +
          'Following migration have failed:\n1_init\n'
      });

      await expect(planMigrations(dir)).resolves.toEqual({
        status: 'error',
        code: 1,
        output:
          '1 migration found in prisma/migrations\n\n' +
          'Loaded Prisma config from prisma.config.ts.\n\n' +
          'Following migration have failed:\n1_init'
      });
    });
  });

  describe('readMigrations', () => {
    test('reads the SQL of each migration, undefined when missing', async () => {
      migration('1_init', 'CREATE TABLE "Post" ();\n');

      await expect(
        readMigrations(dir, ['1_init', '2_missing'])
      ).resolves.toEqual([
        { name: '1_init', sql: 'CREATE TABLE "Post" ();\n' },
        { name: '2_missing', sql: undefined }
      ]);
    });
  });
});
