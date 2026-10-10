import {
  config,
  Database,
  DatabaseType,
  ErrorCode,
  HealthCheckResult,
  IsolationLevel,
  resolveDatabaseType,
  TransactionOptions
} from '@appweaver/common';
import { createClient } from './create-client';
import { DatabaseError } from './database-error';
import {
  currentTransaction,
  runInTransaction,
  settleTransaction,
  TransactionContext
} from './transaction-context';
import { Prisma, PrismaClient } from '../prisma/client/client';

// Members that act on the connection itself, never on a transaction
const ROOT_MEMBERS = new Set<string | symbol>([
  '$connect',
  '$disconnect',
  '$on',
  '$extends'
]);

/**
 * Represents a database utility class that provides methods
 * to connect to and disconnect from the database, as well as
 * access to the database Prisma client instance.
 */
export class PrismaDatabase extends Database {
  /** @internal */
  private _client: PrismaClient | undefined;
  /** @internal */
  private _proxy: PrismaClient | undefined;

  public async onInit(): Promise<void> {
    await this.connect();
  }

  public async onDestroy(): Promise<void> {
    await this.disconnect();
  }

  public async connect(): Promise<void> {
    if (this._client) {
      return;
    }
    await this.clientInstance().$connect();
  }

  public async disconnect(): Promise<void> {
    if (!this._client) {
      return;
    }
    await this._client.$disconnect();
    this._client = undefined;
  }

  /**
   * Returns the Prisma client, which runs its queries in the transaction the
   * current call runs in (see `runTransaction`), and on the connection otherwise.
   */
  public client<T = PrismaClient>(): T {
    this._proxy ??= this.transactionAwareClient();
    return this._proxy as T;
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      await this.client().$queryRaw`SELECT 1`;
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  /**
   * Runs the given function in a transaction, or in the current one when called
   * inside a transaction already. See `runTransaction`.
   *
   * @param {Function} fn - The function to run, receiving the transaction client.
   * @param {TransactionOptions} [options] - The transaction options.
   * @return {Promise<Object>} The value returned by the function.
   * @throws The error thrown by the function, after the transaction rolled back.
   */
  public async transaction<T>(
    fn: (tx: any) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const isolationLevel = this.isolationLevel(options.isolationLevel);

    const current = currentTransaction();
    if (current) {
      if (options.isolationLevel && current.isolationLevel !== isolationLevel) {
        throw new DatabaseError(
          ErrorCode.DatabaseInvalidTransaction,
          `Cannot run a ${isolationLevel} transaction inside a ` +
            `${current.isolationLevel ?? 'default'} isolation level transaction`
        );
      }
      return fn(current.tx);
    }

    for (let attempt = 0; ; attempt++) {
      const context: TransactionContext = {
        tx: undefined as unknown as Prisma.TransactionClient,
        commitCallbacks: new Map(),
        rollbackCallbacks: [],
        isolationLevel
      };

      let result: T;
      try {
        result = await this.clientInstance().$transaction(
          (tx) => {
            context.tx = tx;
            return runInTransaction(context, () => fn(tx));
          },
          { isolationLevel, timeout: options.timeout, maxWait: options.maxWait }
        );
      } catch (e) {
        await settleTransaction(context, false);
        if (attempt < (options.retries ?? 0) && isWriteConflict(e)) {
          continue;
        }
        throw e;
      }

      await settleTransaction(context, true);
      return result;
    }
  }

  /** @internal */
  private clientInstance(): PrismaClient {
    if (!this._client) {
      this._client = createClient();
    }
    return this._client;
  }

  /** @internal */
  private isolationLevel(
    level?: TransactionOptions['isolationLevel']
  ): Prisma.TransactionIsolationLevel | undefined {
    // SQLite runs every transaction serializable and rejects the other levels
    const dbType = resolveDatabaseType(
      config.DATABASE_TYPE,
      config.DATABASE_URL
    );
    if (dbType === DatabaseType.Sqlite) {
      return IsolationLevel.Serializable;
    }
    return level as Prisma.TransactionIsolationLevel | undefined;
  }

  /** @internal */
  private transactionAwareClient(): PrismaClient {
    return new Proxy({} as PrismaClient, {
      get: (_target, property) => {
        const root = this.clientInstance();
        const context = currentTransaction();

        if (property === '$transaction') {
          return (arg: unknown, options?: TransactionOptions) =>
            this.joinTransaction(root, context, arg, options);
        }

        const source: object =
          context && !ROOT_MEMBERS.has(property) ? context.tx : root;
        const value = Reflect.get(source, property);
        return typeof value === 'function' ? value.bind(source) : value;
      }
    });
  }

  /** @internal */
  private joinTransaction(
    root: PrismaClient,
    context: TransactionContext | undefined,
    arg: unknown,
    options?: TransactionOptions
  ): Promise<unknown> {
    if (typeof arg === 'function') {
      return this.transaction(arg as (tx: any) => Promise<unknown>, options);
    }

    // The batch form, whose queries were created on the current transaction
    return context
      ? Promise.all(arg as Promise<unknown>[])
      : root.$transaction(arg as any, options as any);
  }
}

function isWriteConflict(error: unknown): boolean {
  // Followed through the errors wrapping it, i.e. a service's DatabaseError
  for (let e: any = error; e; e = e.cause) {
    if (e.code === 'P2034' || e.code === ErrorCode.DatabaseWriteConflict) {
      return true;
    }
  }
  return false;
}
