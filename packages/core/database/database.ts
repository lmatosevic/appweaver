import { createClient } from './create-client';
import { PrismaClient } from '../prisma/client/client';
import { HealthCheck, HealthCheckResult } from '../types';
import { HEALTH_CHECK } from '../constants';

/**
 * Represents a database utility class that provides methods
 * to connect to and disconnect from the database, as well as
 * access to the database client instance.
 */
export class Database implements HealthCheck {
  private static _client: PrismaClient | undefined;

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

  private clientInstance(): PrismaClient {
    if (!Database._client) {
      Database._client = createClient();
    }
    return Database._client;
  }
}

Database[HEALTH_CHECK] = true;
