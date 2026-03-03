import { PrismaDatabase } from '@appweaver/core';
import { PrismaClient } from '@db/client/client';

export const db = new PrismaDatabase().client<PrismaClient>();

export default db;
