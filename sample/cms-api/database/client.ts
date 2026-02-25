import { Database } from '@appweaver/core';
import { PrismaClient } from '@db/client/client';

export const db = new Database().client<PrismaClient>();

export default db;
