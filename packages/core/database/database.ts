import { createClient } from './create-client';
import { PrismaClient } from '../prisma/client/client';
import { HealthCheck, HealthCheckResult } from '../health';

/**
 * Represents a database utility class that provides methods
 * to connect to and disconnect from the database, as well as
 * access to the database client instance.
 */
export class Database implements HealthCheck {
  public static client: PrismaClient | undefined;

  public async connect(): Promise<void> {
    await this.clientInstance().$connect();
  }

  public async disconnect(): Promise<void> {
    await this.clientInstance().$disconnect();
  }

  public getClient<T = PrismaClient>(): T {
    return this.clientInstance() as T;
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      await this.clientInstance().$queryRaw`SELECT 1`;
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  private clientInstance(): PrismaClient {
    if (!Database.client) {
      Database.client = createClient();
    }
    return Database.client;
  }
}

const db = new Database();

export { db };
