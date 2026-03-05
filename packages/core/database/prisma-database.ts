import { Database, HealthCheckResult } from '@appweaver/common';
import { createClient } from './create-client';
import { PrismaClient } from '../prisma/client/client';

/**
 * Represents a database utility class that provides methods
 * to connect to and disconnect from the database, as well as
 * access to the database Prisma client instance.
 */
export class PrismaDatabase extends Database {
  /** @internal */
  private _client: PrismaClient | undefined;

  public async connect(): Promise<void> {
    await this.client().$connect();
  }

  public async disconnect(): Promise<void> {
    await this.client().$disconnect();
  }

  public client<T = PrismaClient>(): T {
    return this.clientInstance() as T;
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      await this.client().$queryRaw`SELECT 1`;
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  /** @internal */
  private clientInstance(): PrismaClient {
    if (!this._client) {
      this._client = createClient();
    }
    return this._client;
  }
}
