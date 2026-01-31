import { PrismaClient } from '@prisma/client';
import { createClient } from './create-client';

/**
 * Represents a database utility class that provides methods
 * to connect to and disconnect from the database, as well as
 * access to the database client instance.
 */
export class Database {
  public static client: PrismaClient = createClient();

  public async connect(): Promise<void> {
    await Database.client.$connect();
  }

  public async disconnect(): Promise<void> {
    await Database.client.$disconnect();
  }

  get client(): PrismaClient {
    return Database.client;
  }
}

const db = new Database();

export { db };
