import {
  Database,
  IsolationLevel,
  TransactionOptions
} from '@appweaver/common';
import { inject } from '../context';
import { PrismaDatabase } from './prisma-database';

// The transaction client of the application, typed by the callback parameter
// (i.e. `async (tx: Prisma.TransactionClient) => ...` of its generated client)
type TransactionFn<T, Tx> = (tx: Tx) => Promise<T>;

/**
 * Runs the given function in a database transaction. Every service call and
 * every query of the database client made while it runs is part of the
 * transaction, which commits once the function resolves. An error thrown out of
 * the function rolls the transaction back and is rethrown, while an error caught
 * inside it does not.
 *
 * The resource events, the cache invalidation, and the removal of stored files
 * wait for the commit, and are dropped on rollback. A call made inside another
 * transaction joins it.
 *
 * @param {IsolationLevel | TransactionOptions} [options] - The isolation level or
 * the transaction options, falling back to the database default and the config.
 * @param {Function} fn - The function to run, receiving the transaction client.
 * @return {Promise<Object>} The value returned by the function.
 */
export function runTransaction<T, Tx = any>(
  fn: TransactionFn<T, Tx>
): Promise<T>;
export function runTransaction<T, Tx = any>(
  options: IsolationLevel | `${IsolationLevel}` | TransactionOptions,
  fn: TransactionFn<T, Tx>
): Promise<T>;
export function runTransaction<T, Tx = any>(
  optionsOrFn:
    | IsolationLevel
    | `${IsolationLevel}`
    | TransactionOptions
    | TransactionFn<T, Tx>,
  fn?: TransactionFn<T, Tx>
): Promise<T> {
  const db = inject<PrismaDatabase>(Database as any);

  if (typeof optionsOrFn === 'function') {
    return db.transaction(optionsOrFn as TransactionFn<T, unknown>);
  }

  const options =
    typeof optionsOrFn === 'string'
      ? { isolationLevel: optionsOrFn }
      : optionsOrFn;

  return db.transaction(fn as TransactionFn<T, unknown>, options);
}
