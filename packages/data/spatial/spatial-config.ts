import { Type } from '@sinclair/typebox';
import {
  ConfigurationError,
  DatabaseType,
  defineConfig,
  ErrorCode,
  resolveDatabaseType
} from '@appweaver/common';
import { databaseConfig } from '../database/database-config';

/** How the geo fields are stored and queried. */
export type SpatialProvider = 'postgis' | 'database';

export const spatialConfig = defineConfig('spatial', {
  /** How the geo fields are stored and queried: `auto` (`postgis` on PostgreSQL, `database` otherwise), `postgis`
   * (a PostGIS geometry column with a GiST index, PostgreSQL only) or `database` (bounding box columns and exact
   * matching in the application, on every database). Changing it changes the generated schema. Default: `'auto'`. */
  PROVIDER: Type.Enum(
    { auto: 'auto', postgis: 'postgis', database: 'database' },
    { default: 'auto' }
  ),
  /** Maximum number of records a spatial filter matches, a larger match failing with `SPATIAL_TOO_MANY_CANDIDATES`.
   * SQL Server takes at most `2000`, under its limit of parameters of a query. Default: `10000`. */
  MAX_CANDIDATES: Type.Integer({ default: 10000, minimum: 1 }),
  /** Maximum number of positions of a geometry, written or given to a spatial filter. Default: `10000`. */
  MAX_VERTICES: Type.Integer({ default: 10000, minimum: 1 })
});

/**
 * Resolves the spatial provider of the configured database: `postgis` for `auto` on PostgreSQL, `database` otherwise.
 *
 * @return {SpatialProvider} The provider.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for `postgis` on a database other than PostgreSQL.
 */
export function spatialProvider(): SpatialProvider {
  const type = resolveDatabaseType(databaseConfig.TYPE, databaseConfig.URL);
  const provider = spatialConfig.PROVIDER;
  if (provider === 'postgis' && type !== DatabaseType.PostgreSQL) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `The postgis spatial provider needs a PostgreSQL database, not ${type}`
    );
  }
  if (provider === 'auto') {
    return type === DatabaseType.PostgreSQL ? 'postgis' : 'database';
  }
  return provider;
}

/**
 * The maximum number of records a spatial filter matches on the configured database.
 *
 * @return {number} The maximum.
 */
export function spatialMaxCandidates(): number {
  const type = resolveDatabaseType(databaseConfig.TYPE, databaseConfig.URL);
  return type === DatabaseType.SQLServer
    ? Math.min(spatialConfig.MAX_CANDIDATES, 2000)
    : spatialConfig.MAX_CANDIDATES;
}
