import { DatabaseType } from '@appweaver/common';
import { databaseConfig } from '../database/database-config';

/**
 * The `schema` parameter of a PostgreSQL URL, which the Prisma client leaves out of the raw queries.
 *
 * @param {DatabaseType} type - The database type.
 * @return {string | undefined} The schema, undefined for another database or a URL without one.
 */
export function postgresSchema(type: DatabaseType): string | undefined {
  if (type !== DatabaseType.PostgreSQL) {
    return undefined;
  }
  try {
    return new URL(databaseConfig.URL).searchParams.get('schema') ?? undefined;
  } catch {
    return undefined;
  }
}
