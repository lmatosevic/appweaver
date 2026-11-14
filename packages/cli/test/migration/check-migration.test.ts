import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configOverrides } from '@appweaver/common';

const loadModels = jest.fn();
const runProcessOutput = jest.fn();
const planMigrations = jest.fn();
const validateRelations = jest.fn();
const buildPrismaSchema = jest.fn();

// fkill is ESM only, and the tests never kill a process
jest.mock('fkill', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils', () => ({
  ...jest.requireActual('../../utils'),
  loadModels: (...args: any[]) => loadModels(...args),
  runProcessOutput: (...args: any[]) => runProcessOutput(...args),
  seriesInDatabase: () => true
}));
// The generators load prettier, which is ESM only
jest.mock('../../generate', () => ({
  buildPrismaSchema: (...args: any[]) => buildPrismaSchema(...args),
  validateRelations: (...args: any[]) => validateRelations(...args)
}));
jest.mock('../../migrate/plan-migrations', () => ({
  planMigrations: (...args: any[]) => planMigrations(...args)
}));

import { checkMigration } from '../../migration/check-migration';

describe('check-migration', () => {
  let dir: string;
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  const logged = () => log.mock.calls.flat().join('\n');
  const diff = (code: number, stdout = '', stderr = '') =>
    runProcessOutput.mockResolvedValue({ code, stdout, stderr });
  const diffArgs = () => runProcessOutput.mock.calls[0][1] as string[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-check-'));
    configOverrides.DATABASE_SCHEMA_PATH = path.join(dir, 'schema.prisma');
    configOverrides.DATABASE_MIGRATIONS_DIR_PATH = path.join(dir, 'migrations');
    fs.writeFileSync(path.join(dir, 'schema.prisma'), 'model Post {\n}');

    loadModels.mockReset().mockResolvedValue({ models: {}, modules: [] });
    validateRelations.mockReset().mockReturnValue([]);
    buildPrismaSchema.mockReset().mockReturnValue('model Post {\n}');
    planMigrations.mockReset().mockResolvedValue({ status: 'up-to-date' });
    runProcessOutput.mockReset();
    diff(0);
    log = jest.spyOn(console, 'log').mockImplementation();
    error = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete configOverrides.DATABASE_SCHEMA_PATH;
    delete configOverrides.DATABASE_MIGRATIONS_DIR_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('checkMigration', () => {
    test('needs no migration when the database matches the models', async () => {
      await expect(checkMigration()).resolves.toBe(0);

      expect(logged()).toBe(
        'No migration needed, the database matches the models.'
      );
      expect(planMigrations).toHaveBeenCalledWith(path.join(dir, 'migrations'));
    });

    test('builds the schema with the storage of the geo fields', async () => {
      await checkMigration();
      expect(buildPrismaSchema.mock.calls[0].slice(3)).toEqual([
        true,
        'database'
      ]);

      configOverrides.DATABASE_TYPE = 'postgresql';
      loadModels.mockResolvedValue({
        models: {
          Store: { config: { geo: { location: { type: 'point' } } } }
        },
        modules: []
      });
      await checkMigration();
      expect(buildPrismaSchema.mock.calls[1][4]).toBe('postgis');
      delete configOverrides.DATABASE_TYPE;
    });

    test('compares the database with the schema of the models, in a temporary file', async () => {
      let schema: string | undefined;
      runProcessOutput.mockImplementation(async (_, args: string[]) => {
        schema = fs.readFileSync(args[4].replace(/"/g, ''), 'utf8');
        return { code: 0, stdout: '', stderr: '' };
      });

      await checkMigration();

      const [command, args] = runProcessOutput.mock.calls[0];
      expect(command).toBe('prisma');
      expect(args).toEqual([
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        expect.stringMatching(/^".*schema\.prisma"$/),
        '--script',
        '--exit-code'
      ]);
      expect(schema).toBe('model Post {\n}');
      expect(args[4]).not.toContain(dir);
      expect(fs.existsSync(args[4].replace(/"/g, ''))).toBe(false);
    });

    test('loads the models of the given pattern, pruned or not', async () => {
      await checkMigration({ modelPattern: './models/*.ts', prune: false });

      expect(loadModels).toHaveBeenCalledWith('./models/*.ts', false);
    });

    test('prints the SQL of a needed migration and how to create it', async () => {
      diff(2, '-- AlterTable\nALTER TABLE "Post" ADD COLUMN "body" TEXT;\n');

      await expect(checkMigration()).resolves.toBe(1);

      expect(logged()).toBe(
        'A migration is needed, it would run:\n\n' +
          '-- AlterTable\nALTER TABLE "Post" ADD COLUMN "body" TEXT;\n\n' +
          'Create it with: weaver migration new <name>'
      );
    });

    test('tells to generate the schema first when it is out of date with the models', async () => {
      fs.writeFileSync(path.join(dir, 'schema.prisma'), 'model Old {}');
      diff(2, 'ALTER TABLE "Post" ADD COLUMN "body" TEXT;');

      await expect(checkMigration()).resolves.toBe(1);

      expect(logged()).toContain(
        'Create it with: weaver generate && weaver migration new <name>'
      );
    });

    test('names a schema out of date with the models when no migration is needed', async () => {
      fs.rmSync(path.join(dir, 'schema.prisma'));

      await expect(checkMigration()).resolves.toBe(0);

      expect(logged()).toContain('update it with "weaver generate"');
    });

    test('takes a schema with other line endings as up to date', async () => {
      fs.writeFileSync(path.join(dir, 'schema.prisma'), 'model Post {\r\n}');
      diff(2, 'ALTER TABLE "Post" ADD COLUMN "body" TEXT;');

      await checkMigration();

      expect(logged()).not.toContain('weaver generate');
    });

    test('fails on models with inconsistent relations', async () => {
      validateRelations.mockReturnValue(['Post.author is not mapped']);

      await expect(checkMigration()).resolves.toBe(2);

      expect(error).toHaveBeenCalledWith('Post.author is not mapped');
      expect(planMigrations).not.toHaveBeenCalled();
    });

    test('fails with the output of a failed migration status', async () => {
      planMigrations.mockResolvedValue({
        status: 'error',
        code: 1,
        output: 'Error: P1001'
      });

      await expect(checkMigration()).resolves.toBe(2);

      expect(error).toHaveBeenCalledWith('Error: P1001');
      expect(runProcessOutput).not.toHaveBeenCalled();
    });

    test('fails on pending migrations, which the database is compared without', async () => {
      planMigrations.mockResolvedValue({
        status: 'pending',
        migrations: ['1_init'],
        database: 'managed'
      });

      await expect(checkMigration()).resolves.toBe(2);

      expect(error).toHaveBeenCalledWith(
        'The database has 1 pending migration, run "weaver migrate" before checking for a new one.'
      );
      expect(runProcessOutput).not.toHaveBeenCalled();
    });

    test('compares with an empty database for the first migration of a project', async () => {
      planMigrations.mockResolvedValue({
        status: 'pending',
        migrations: [],
        database: 'missing'
      });
      diff(2, 'CREATE TABLE "Post" ();');

      await expect(checkMigration()).resolves.toBe(1);

      expect(diffArgs()[2]).toBe('--from-empty');
    });

    test('fails with the output of a failed comparison', async () => {
      diff(1, '', 'Error: P1001: cannot reach the database');

      await expect(checkMigration()).resolves.toBe(2);

      expect(error).toHaveBeenCalledWith(
        'Error: P1001: cannot reach the database'
      );
    });
  });
});
