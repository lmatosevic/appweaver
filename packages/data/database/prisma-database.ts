import {
  Database,
  DatabaseType,
  ErrorCode,
  HealthCheckResult,
  IsolationLevel,
  createLogger,
  resolveDatabaseType,
  TransactionOptions,
  DatabaseError
} from '@appweaver/common';
import { databaseConfig } from './database-config';
import { createClient } from './create-client';
import { Prisma, PrismaClient } from '../prisma/client/client';
import {
  currentTransaction,
  runInTransaction,
  settleTransaction,
  TransactionContext
} from '@appweaver/core/internal';

const logger = createLogger('database');

/** The transaction of the Prisma client the current call runs in. */
type PrismaTransaction = TransactionContext<
  Prisma.TransactionClient,
  Prisma.TransactionIsolationLevel
>;

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

  /**
   * Connects to the database and checks the connection, logging an error when the database is unreachable instead of
   * failing the start, since most drivers connect lazily and the queries reconnect once it is reachable.
   */
  public async onInit(): Promise<void> {
    try {
      await this.connect();
      await this.clientInstance().$queryRaw`SELECT 1`;
    } catch (error) {
      const dbType = resolveDatabaseType(
        databaseConfig.TYPE,
        databaseConfig.URL
      );
      const url = this.redactUrl(databaseConfig.URL);
      logger.error(
        error,
        `Cannot connect to the ${dbType} database${url ? ` at ${url}` : ''}`
      );
      // The next query creates a new client, which detects the capabilities of the database again
      await this.disconnect().catch(() => undefined);
      this._client = undefined;
    }
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

    const current = currentTransaction<
      Prisma.TransactionClient,
      Prisma.TransactionIsolationLevel
    >();
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
      const context: PrismaTransaction = {
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
        if (attempt < (options.retries ?? 0) && this.isWriteConflict(e)) {
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
    const dbType = resolveDatabaseType(databaseConfig.TYPE, databaseConfig.URL);
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
        const context = currentTransaction<
          Prisma.TransactionClient,
          Prisma.TransactionIsolationLevel
        >();

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
    context: PrismaTransaction | undefined,
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

  /** @internal */
  private redactUrl(url: string): string {
    return url
      .replace(/(\/\/[^:/@]*):[^@/]*@/, '$1:********@')
      .replace(/((?:password|pwd)=)[^;&]*/gi, '$1********');
  }

  /** @internal */
  private isWriteConflict(error: unknown): boolean {
    // Followed through the errors wrapping it, i.e. a service's DatabaseError
    for (let e: any = error; e; e = e.cause) {
      if (e.code === 'P2034' || e.code === ErrorCode.DatabaseWriteConflict) {
        return true;
      }
    }
    return false;
  }
}
