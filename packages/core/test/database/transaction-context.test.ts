import { logger } from '@appweaver/common';
import {
  afterCommit,
  afterRollback,
  currentTransaction,
  runInTransaction,
  settleTransaction,
  TransactionContext
} from '../../database/transaction-context';

const createContext = (): TransactionContext => ({
  tx: {} as any,
  commitCallbacks: new Map(),
  rollbackCallbacks: []
});

describe('transaction-context', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('currentTransaction', () => {
    test('returns the transaction the call runs in', () => {
      const context = createContext();

      expect(currentTransaction()).toBeUndefined();
      runInTransaction(context, () => {
        expect(currentTransaction()).toBe(context);
      });
    });

    test('follows the asynchronous calls of the function', async () => {
      const context = createContext();

      await runInTransaction(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        expect(currentTransaction()).toBe(context);
      });
    });
  });

  describe('afterCommit', () => {
    test('runs the callback right away outside a transaction', async () => {
      const callback = jest.fn();

      afterCommit(callback);
      await Promise.resolve();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('runs the callbacks on commit, in the order they were registered', async () => {
      const context = createContext();
      const calls: number[] = [];

      runInTransaction(context, () => {
        afterCommit(() => calls.push(1));
        afterCommit(() => calls.push(2));
      });
      expect(calls).toEqual([]);

      await settleTransaction(context, true);
      expect(calls).toEqual([1, 2]);
    });

    test('drops the callbacks on rollback', async () => {
      const context = createContext();
      const callback = jest.fn();

      runInTransaction(context, () => afterCommit(callback));
      await settleTransaction(context, false);

      expect(callback).not.toHaveBeenCalled();
    });

    test('keeps the first callback registered under a key', async () => {
      const context = createContext();
      const first = jest.fn();
      const second = jest.fn();

      runInTransaction(context, () => {
        afterCommit(first, 'cache:Post');
        afterCommit(second, 'cache:Post');
      });
      await settleTransaction(context, true);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
    });

    test('logs a failing callback and runs the others', async () => {
      const context = createContext();
      const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
      const callback = jest.fn();

      runInTransaction(context, () => {
        afterCommit(() => {
          throw new Error('failed');
        });
        afterCommit(callback);
      });
      await settleTransaction(context, true);

      expect(error).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('afterRollback', () => {
    test('runs the callbacks on rollback only', async () => {
      const committed = createContext();
      const rolledBack = createContext();
      const onCommitted = jest.fn();
      const onRolledBack = jest.fn();

      runInTransaction(committed, () => afterRollback(onCommitted));
      runInTransaction(rolledBack, () => afterRollback(onRolledBack));
      await settleTransaction(committed, true);
      await settleTransaction(rolledBack, false);

      expect(onCommitted).not.toHaveBeenCalled();
      expect(onRolledBack).toHaveBeenCalled();
    });

    test('ignores the callback outside a transaction', () => {
      const callback = jest.fn();

      afterRollback(callback);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
