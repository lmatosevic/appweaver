import { db as database } from '@appweaver/core';
import { PrismaClient } from '@db/client/client';

export const db = database.getClient<PrismaClient>();

export default db;
