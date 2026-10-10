jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  const configOverrides: Record<string, unknown> = {};
  return {
    __esModule: true,
    ...actual,
    configOverrides,
    get config() {
      return { ...actual.config, ...configOverrides };
    }
  };
});

jest.mock('../../database/create-client', () => ({
  createClient: jest.fn()
}));

import * as common from '@appweaver/common';
import { ApplicationError, ErrorCode } from '@appweaver/common';
import { DatabaseError } from '../../database/database-error';
import { PrismaDatabase } from '../../database/prisma-database';
import {
  afterCommit,
  afterRollback,
  currentTransaction
} from '../../database/transaction-context';
import { createClient } from '../../database/create-client';

/** A Prisma client stand-in, running each transaction on its own client. */
function createRoot() {
  const tx = {
    post: { create: jest.fn(async () => ({ id: 1 })) },
    $queryRaw: jest.fn()
  };
  const root = {
    post: { create: jest.fn(async () => ({ id: 2 })) },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $on: jest.fn(),
    $extends: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (arg: any, _options?: any) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg)
    )
  };
  return { root, tx };
}

describe('prisma-database', () => {
  let db: PrismaDatabase;
  let root: ReturnType<typeof createRoot>['root'];
  let tx: ReturnType<typeof createRoot>['tx'];

  const overrides = (common as any).configOverrides as Record<string, unknown>;

  beforeEach(() => {
    ({ root, tx } = createRoot());
    (createClient as jest.Mock).mockReturnValue(root);
    db = new PrismaDatabase();
    overrides.DATABASE_TYPE = common.DatabaseType.PostgresSQL;
  });

  afterEach(() => {
    delete overrides.DATABASE_TYPE;
  });

  describe('client', () => {
    test('runs the queries on the connection outside a transaction', async () => {
      await expect(db.client<any>().post.create({})).resolves.toEqual({
        id: 2
      });
      expect(tx.post.create).not.toHaveBeenCalled();
    });

    test('runs the queries in the current transaction', async () => {
      await db.transaction(async () => {
        await expect(db.client<any>().post.create({})).resolves.toEqual({
          id: 1
        });
      });
      expect(root.post.create).not.toHaveBeenCalled();
    });

    test('keeps the connection members on the connection', async () => {
      await db.transaction(async () => {
        await db.client<any>().$on('query', jest.fn());
        await db.client<any>().$queryRaw`SELECT 1`;
      });

      expect(root.$on).toHaveBeenCalled();
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(root.$queryRaw).not.toHaveBeenCalled();
    });

    test('starts a transaction for a callback outside of one', async () => {
      const result = await db
        .client<any>()
        .$transaction(async (client: any) => {
          expect(client).toBe(tx);
          expect(currentTransaction()).toBeDefined();
          return 'done';
        });

      expect(result).toBe('done');
      expect(root.$transaction).toHaveBeenCalledTimes(1);
    });

    test('joins the current transaction with a callback or a batch', async () => {
      await db.transaction(async () => {
        await db.client<any>().$transaction(async (client: any) => {
          expect(client).toBe(tx);
        });
        await expect(
          db
            .client<any>()
            .$transaction([Promise.resolve(1), Promise.resolve(2)])
        ).resolves.toEqual([1, 2]);
      });

      expect(root.$transaction).toHaveBeenCalledTimes(1);
    });

    test('runs a batch outside a transaction on the connection', async () => {
      await db.client<any>().$transaction([Promise.resolve(1)]);

      expect(root.$transaction).toHaveBeenCalledWith(
        [expect.any(Promise)],
        undefined
      );
    });
  });

  describe('transaction', () => {
    test('passes the options to the transaction', async () => {
      await db.transaction(async () => undefined, {
        isolationLevel: 'RepeatableRead',
        timeout: 1000,
        maxWait: 200
      });

      expect(root.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
        timeout: 1000,
        maxWait: 200
      });
    });

    test('leaves the options to the database defaults and the config', async () => {
      await db.transaction(async () => undefined);

      expect(root.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: undefined,
        timeout: undefined,
        maxWait: undefined
      });
    });

    test('always runs serializable on SQLite', async () => {
      overrides.DATABASE_TYPE = common.DatabaseType.Sqlite;

      await db.transaction(async () => undefined);
      await db.transaction(async () => undefined, {
        isolationLevel: 'ReadCommitted'
      });

      for (const [, options] of root.$transaction.mock.calls) {
        expect(options).toMatchObject({ isolationLevel: 'Serializable' });
      }
    });

    test('returns the value of the function and runs the commit callbacks', async () => {
      const onCommit = jest.fn();
      const onRollback = jest.fn();

      const result = await db.transaction(async () => {
        afterCommit(onCommit);
        afterRollback(onRollback);
        expect(onCommit).not.toHaveBeenCalled();
        return 42;
      });

      expect(result).toBe(42);
      expect(onCommit).toHaveBeenCalled();
      expect(onRollback).not.toHaveBeenCalled();
    });

    test('rethrows the error unchanged and runs the rollback callbacks', async () => {
      const error = new ApplicationError('OUT_OF_STOCK', 'Out of stock');
      const onCommit = jest.fn();
      const onRollback = jest.fn();

      await expect(
        db.transaction(async () => {
          afterCommit(onCommit);
          afterRollback(onRollback);
          throw error;
        })
      ).rejects.toBe(error);

      expect(onCommit).not.toHaveBeenCalled();
      expect(onRollback).toHaveBeenCalled();
    });

    test('joins the current transaction when nested', async () => {
      const onCommit = jest.fn();

      await db.transaction(async (outer) => {
        await db.transaction(async (inner) => {
          expect(inner).toBe(outer);
          afterCommit(onCommit);
        });
        expect(onCommit).not.toHaveBeenCalled();
      });

      expect(root.$transaction).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    test('rejects a nested transaction with another isolation level', async () => {
      await expect(
        db.transaction(async () => {
          await db.transaction(async () => undefined, {
            isolationLevel: 'Serializable'
          });
        })
      ).rejects.toThrow('Cannot run a Serializable transaction');
    });

    test('runs the function again after a write conflict', async () => {
      const onRollback = jest.fn();
      let attempts = 0;
      root.$transaction.mockImplementation(async (fn: any) => {
        const result = await fn(tx);
        attempts++;
        if (attempts === 1) {
          throw new DatabaseError(
            ErrorCode.DatabaseWriteConflict,
            'Update error',
            {},
            { cause: { code: 'P2034' } }
          );
        }
        return result;
      });

      const result = await db.transaction(
        async () => {
          afterRollback(onRollback);
          return 'done';
        },
        { retries: 2 }
      );

      expect(result).toBe('done');
      expect(root.$transaction).toHaveBeenCalledTimes(2);
      expect(onRollback).toHaveBeenCalledTimes(1);
    });

    test('rethrows a write conflict once the retries ran out', async () => {
      const conflict = { code: 'P2034' };
      root.$transaction.mockRejectedValue(conflict);

      await expect(
        db.transaction(async () => undefined, { retries: 1 })
      ).rejects.toBe(conflict);
      expect(root.$transaction).toHaveBeenCalledTimes(2);
    });

    test('does not retry other errors', async () => {
      root.$transaction.mockRejectedValue(new Error('failed'));

      await expect(
        db.transaction(async () => undefined, { retries: 3 })
      ).rejects.toThrow('failed');
      expect(root.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
