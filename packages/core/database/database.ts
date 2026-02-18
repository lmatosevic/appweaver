import { PrismaClient } from '../prisma/client/client';
import { createClient } from './create-client';

/**
 * Represents a database utility class that provides methods
 * to connect to and disconnect from the database, as well as
 * access to the database client instance.
 */
export class Database {
  public static client: PrismaClient | undefined;

  public async connect(): Promise<void> {
    await this.clientInstance().$connect();
  }

  public async disconnect(): Promise<void> {
    await this.clientInstance().$disconnect();
  }

  get client(): PrismaClient {
    return this.clientInstance();
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
