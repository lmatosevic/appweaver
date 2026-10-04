import { IsolationLevel } from '../enums';

/** The options of a transaction, each falling back to the database default or config. */
export type TransactionOptions = {
  /** Isolation level (default: the database default, always `Serializable` on SQLite) */
  isolationLevel?: IsolationLevel | `${IsolationLevel}`;
  /** Maximum time in milliseconds the transaction may run (default: `DATABASE_TRANSACTION_TIMEOUT` config) */
  timeout?: number;
  /** Maximum time in milliseconds to wait for a connection (default: `DATABASE_TRANSACTION_MAX_WAIT` config) */
  maxWait?: number;
  /** Times the whole transaction is run again after a write conflict or a serialization failure (default: `0`) */
  retries?: number;
};
