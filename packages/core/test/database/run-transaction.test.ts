import { Database, IsolationLevel } from '@appweaver/common';
import { define } from '../../context';
import { runTransaction } from '../../database/run-transaction';
import { resetContext } from '../fixtures/context-fixture';

describe('run-transaction', () => {
  const transaction = jest.fn(async (fn: any) => fn('tx'));

  beforeEach(() => {
    resetContext();
    transaction.mockClear();
    define({ transaction } as any, Database);
  });

  afterAll(() => {
    resetContext();
  });

  describe('runTransaction', () => {
    test('runs the function with the database defaults', async () => {
      const fn = jest.fn(async (tx: any) => `${tx}-result`);

      await expect(runTransaction(fn)).resolves.toBe('tx-result');
      expect(transaction).toHaveBeenCalledWith(fn);
    });

    test('takes the isolation level as the first argument', async () => {
      const fn = jest.fn(async () => undefined);

      await runTransaction(IsolationLevel.Serializable, fn);
      await runTransaction('ReadCommitted', fn);

      expect(transaction).toHaveBeenNthCalledWith(1, fn, {
        isolationLevel: 'Serializable'
      });
      expect(transaction).toHaveBeenNthCalledWith(2, fn, {
        isolationLevel: 'ReadCommitted'
      });
    });

    test('takes the transaction options as the first argument', async () => {
      const fn = jest.fn(async () => undefined);
      const options = { timeout: 1000, retries: 2 };

      await runTransaction(options, fn);

      expect(transaction).toHaveBeenCalledWith(fn, options);
    });
  });
});
