import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '@appweaver/common';
import { Prisma } from '../prisma/client/client';

/** The state of the transaction the current call runs in. */
export type TransactionContext = {
  tx: Prisma.TransactionClient;
  commitCallbacks: Map<string | symbol, () => unknown>;
  rollbackCallbacks: (() => unknown)[];
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

const transactionStorage = new AsyncLocalStorage<TransactionContext>();

/**
 * Returns the transaction the current call runs in, started by `runTransaction`.
 *
 * @return {TransactionContext | undefined} The current transaction, or undefined outside of one.
 */
export function currentTransaction(): TransactionContext | undefined {
  return transactionStorage.getStore();
}

/**
 * Runs the given function inside the given transaction.
 *
 * @param {TransactionContext} context - The transaction to run the function in.
 * @param {Function} fn - The function to run.
 * @return {Object} The value returned by the function.
 */
export function runInTransaction<T>(
  context: TransactionContext,
  fn: () => T
): T {
  return transactionStorage.run(context, fn);
}

/**
 * Runs the given callback once the current transaction commits, and drops it if
 * the transaction rolls back. Outside a transaction, the callback runs right away.
 * An error thrown by the callback is logged, since the transaction has already
 * committed by then.
 *
 * @param {Function} fn - The callback to run.
 * @param {string} [key] - Deduplicates the callbacks registered under the same key,
 * keeping the first one.
 */
export function afterCommit(fn: () => unknown, key?: string): void {
  const context = currentTransaction();

  if (!context) {
    void runSafe(fn, 'After commit callback error');
    return;
  }

  const callbackKey = key ?? Symbol();
  if (!context.commitCallbacks.has(callbackKey)) {
    context.commitCallbacks.set(callbackKey, fn);
  }
}

/**
 * Runs the given callback if the current transaction rolls back, i.e. to remove
 * what was written outside the database. Outside a transaction, it is ignored.
 *
 * @param {Function} fn - The callback to run.
 */
export function afterRollback(fn: () => unknown): void {
  currentTransaction()?.rollbackCallbacks.push(fn);
}

/**
 * Runs the callbacks registered for the outcome of a finished transaction, one
 * after another in the order they were registered.
 *
 * @param {TransactionContext} context - The finished transaction.
 * @param {boolean} committed - Whether the transaction committed or rolled back.
 */
export async function settleTransaction(
  context: TransactionContext,
  committed: boolean
): Promise<void> {
  const callbacks = committed
    ? [...context.commitCallbacks.values()]
    : context.rollbackCallbacks;

  for (const callback of callbacks) {
    await runSafe(
      callback,
      committed
        ? 'After commit callback error'
        : 'After rollback callback error'
    );
  }
}

async function runSafe(fn: () => unknown, message: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    logger.error(e, message);
  }
}
