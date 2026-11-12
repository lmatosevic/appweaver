jest.mock('@appweaver/common', () => ({
  __esModule: true,
  ...jest.requireActual('@appweaver/common'),
  importModule: jest.fn()
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database, importModule } from '@appweaver/common';
import { define } from '@appweaver/core';
import { Seeder } from '../../seeder/seeder';
import { prismaError, resetContext } from '@appweaver/testing';

type SeederRecord = { id: number; seederName: string; checksum: string };

describe('seeder', () => {
  let dir: string;
  let records: SeederRecord[];
  let table: Record<string, jest.Mock>;
  let modules: Record<string, Record<string, unknown>>;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  /** Writes a seeder file, whose exports the mocked `importModule` returns. */
  const seederFile = (name: string, exports: Record<string, unknown>) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `// ${name}`);
    modules[file] = exports;
    return file;
  };

  const logged = (spy: jest.SpyInstance) => spy.mock.calls.flat().join('\n');

  beforeEach(() => {
    resetContext();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-seeders-'));
    records = [];
    modules = {};
    table = {
      findMany: jest.fn(async () => [...records]),
      create: jest.fn(async ({ data }) => {
        records.push({ id: records.length + 1, ...data });
      }),
      update: jest.fn(),
      delete: jest.fn()
    };
    define({ client: () => ({ seeder: table }) }, Database);
    (importModule as jest.Mock).mockImplementation(async (file: string) => ({
      value: modules[file],
      error: null
    }));
    log = jest.spyOn(console, 'log').mockImplementation();
    warn = jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  afterAll(() => {
    resetContext();
  });

  describe('seed', () => {
    test('runs the pending seeders in order and records them', async () => {
      const order: string[] = [];
      seederFile('10-posts.ts', { posts: async () => order.push('posts') });
      seederFile('2-users.js', {
        users: async () => {
          order.push('users');
          return { created: 2 };
        },
        notAFunction: 1
      });
      seederFile('types.d.ts', {});

      await new Seeder(dir).seed();

      expect(order).toEqual(['users', 'posts']);
      expect(records.map((r) => r.seederName)).toEqual(['2-users', '10-posts']);
      expect(table.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          seederName: '2-users',
          checksum: expect.any(String),
          logs: '{"created":2}'
        })
      });
      expect(logged(log)).toContain('Executed 2 seeders');
    });

    test('skips the seeders already executed', async () => {
      const users = jest.fn();
      seederFile('1-users.ts', { users });
      await new Seeder(dir).seed();

      await new Seeder(dir).seed();

      expect(users).toHaveBeenCalledTimes(1);
      expect(records).toHaveLength(1);
      expect(logged(log)).toContain('No pending seeders to execute');
    });

    test('warns about a changed seeder, and fixes its checksum when asked', async () => {
      const file = seederFile('1-users.ts', { users: jest.fn() });
      await new Seeder(dir).seed();
      fs.writeFileSync(file, '// changed');

      await new Seeder(dir).seed();
      expect(logged(warn)).toContain('has different checksum');
      expect(table.update).not.toHaveBeenCalled();

      await new Seeder(dir, false, true).seed();
      expect(table.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { checksum: expect.any(String) }
      });
    });

    test('warns about a recorded seeder without a file, and removes it when asked', async () => {
      records.push({ id: 7, seederName: 'removed', checksum: 'x' });

      await new Seeder(dir).seed();
      expect(logged(warn)).toContain('seeder removed does not exist');
      expect(table.delete).not.toHaveBeenCalled();

      await new Seeder(dir, false, true).seed();
      expect(table.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    });

    test('lists the pending seeders on a dry run, without running or recording them', async () => {
      const ran = jest.fn();
      seederFile('1-users.ts', { users: ran });
      seederFile('2-posts.ts', { posts: ran });

      await new Seeder(dir, false, false, [], true).seed();

      expect(ran).not.toHaveBeenCalled();
      expect(table.create).not.toHaveBeenCalled();
      expect(logged(log)).toContain('Would seed 1-users');
      expect(logged(log)).toContain('Would seed 2-posts');
      expect(logged(log)).toContain('2 seeders would be executed');
      expect(logged(log)).toContain('Dry run, no seeder was run.');
    });

    test.each(['P1003', 'P2021'])(
      'lists every seeder on a dry run of a database not migrated yet (%s)',
      async (code) => {
        seederFile('1-users.ts', { users: jest.fn() });
        table.findMany.mockRejectedValue(prismaError(code));

        await new Seeder(dir, false, true, [], true).seed();

        expect(logged(log)).toContain('The database is not migrated yet');
        expect(logged(log)).toContain('Would seed 1-users');
        expect(logged(log)).toContain('1 seeder would be executed');
      }
    );

    test('fails on a database not migrated yet, unless it is a dry run', async () => {
      const error = prismaError('P2021');
      table.findMany.mockRejectedValue(error);
      seederFile('1-users.ts', { users: jest.fn() });

      await expect(new Seeder(dir).seed()).rejects.toBe(error);
    });

    test('fails on any other database error of a dry run', async () => {
      const error = prismaError('P1001');
      table.findMany.mockRejectedValue(error);

      await expect(new Seeder(dir, false, false, [], true).seed()).rejects.toBe(
        error
      );
    });

    test('reports the warnings it would fix on a dry run, without fixing them', async () => {
      seederFile('1-users.ts', { users: jest.fn() });
      records.push(
        { id: 1, seederName: '1-users', checksum: 'old' },
        { id: 7, seederName: 'removed', checksum: 'x' }
      );

      await new Seeder(dir, false, true, [], true).seed();

      expect(logged(warn)).toContain('has different checksum');
      expect(logged(warn)).toContain('seeder removed does not exist');
      expect(logged(log)).toContain('Fix: seeder checksum would be updated');
      expect(logged(log)).toContain('Fix: would remove seeder from database');
      expect(logged(log)).toContain('No pending seeders to execute');
      expect(table.update).not.toHaveBeenCalled();
      expect(table.delete).not.toHaveBeenCalled();
    });

    test('stops on a failing seeder, unless continuing on errors', async () => {
      seederFile('1-users.ts', {
        users: async () => {
          throw new Error('boom');
        }
      });

      await expect(new Seeder(dir).seed()).rejects.toThrow('boom');
      expect(records).toHaveLength(0);

      await new Seeder(dir, true).seed();
      expect(records[0]).toMatchObject({ logs: 'Error: boom' });
    });

    test('runs the seeders of the modules first, under their module name', async () => {
      const order: string[] = [];
      const moduleDir = path.join(dir, 'billing');
      fs.mkdirSync(moduleDir);
      seederFile('1-users.ts', { users: async () => order.push('users') });
      seederFile('billing/1-plans.ts', {
        plans: async () => order.push('plans')
      });

      await new Seeder(dir, false, false, [
        { name: 'billing', path: moduleDir }
      ]).seed();

      expect(order).toEqual(['plans', 'users']);
      expect(records.map((r) => r.seederName)).toEqual([
        'billing/1-plans',
        '1-users'
      ]);
      expect(logged(log)).toContain('2 seeders found in');
    });

    test('reports a seeders directory that is not accessible', async () => {
      const error = jest.spyOn(console, 'error');

      await new Seeder(path.join(dir, 'missing')).seed();

      expect(logged(warn)).toContain('is not accessible');
      expect(logged(error)).toContain('No seeders directory is accessible');
      expect(table.create).not.toHaveBeenCalled();
    });

    test('runs the seeders of a module without a seeders directory of the application', async () => {
      const order: string[] = [];
      seederFile('1-plans.ts', { plans: async () => order.push('plans') });
      records.push({ id: 9, seederName: '1-users', checksum: 'x' });

      await new Seeder(path.join(dir, 'missing'), false, true, [
        { name: 'billing', path: dir }
      ]).seed();

      expect(order).toEqual(['plans']);
      expect(records.map((r) => r.seederName)).toContain('billing/1-plans');
      // The seeders of the missing directory are kept
      expect(table.delete).not.toHaveBeenCalled();
    });
  });
});
