import { injectDatabaseClient } from '@appweaver/core';
import { PrismaClient } from '@db/client/client';

export const db = injectDatabaseClient<PrismaClient>();

export default db;
