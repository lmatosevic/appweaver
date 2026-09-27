import { inject } from '@appweaver/core';
import { Database } from '@appweaver/common';
import { PrismaClient } from '@db/client/client';

export const db = inject(Database).client<PrismaClient>();

export default db;
