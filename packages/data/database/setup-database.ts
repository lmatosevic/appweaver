import fs from 'node:fs';
import {
  appConfig,
  Database,
  resolveSourcePath,
  TimeSeries
} from '@appweaver/common';
import { discoverModules, inject, TimeSeriesService } from '@appweaver/core';
import { loadProviders } from '@appweaver/core/internal';
import { loadResources } from '../resource/resource-loader';
import { spatialProvider } from '../spatial/spatial-config';
import { PostgisSpatialEngine } from '../spatial/spatial-engine';
import { SpatialService } from '../spatial/spatial-service';
import { TimescaleTimeSeries } from '../timeseries/timescale-time-series';
import { PrismaDatabase } from './prisma-database';

export type SetupDatabaseParams = {
  /** The directory of the application source code the models are loaded from. (default: ./dist/src) */
  scanPath?: string;
};

export type SetupDatabaseResult = {
  /** The directory the models were loaded from */
  scanPath: string;
  /** Whether the directory exists, the setup being skipped otherwise, i.e. before the build */
  built: boolean;
  /** The parts set up, empty when the models need none */
  parts: string[];
};

/**
 * Sets up the parts of the database the Prisma migrations do not hold, which the application otherwise sets up when
 * it starts: the hypertables and the policies of the `timescale` time series provider, and the geometry triggers of
 * the `postgis` spatial provider. Run by `weaver migrate` with the user of `database.migrationUrl`, so the user of the
 * application needs no privilege to change the schema.
 *
 * @param {SetupDatabaseParams} [params={}] - The setup parameters.
 * @return {Promise<SetupDatabaseResult>} The parts set up, and whether the models were built.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` when a part cannot be set up, i.e. without the extension.
 */
export async function setupDatabase(
  params: SetupDatabaseParams = {}
): Promise<SetupDatabaseResult> {
  const scanPath = resolveSourcePath(
    appConfig.BUILD_PATH,
    appConfig.SOURCE_PATH,
    params.scanPath,
    './dist/src'
  );
  if (!fs.existsSync(scanPath)) {
    return { scanPath, built: false, parts: [] };
  }

  const modules = await discoverModules({ scanPath });
  await loadProviders(modules, scanPath);
  await loadResources(
    scanPath,
    undefined,
    modules.flatMap(({ module }) =>
      module.resources ? [module.resources] : []
    )
  );

  const store = inject(TimeSeries, false);
  const seriesModels =
    store instanceof TimescaleTimeSeries
      ? (inject(TimeSeriesService, false)?.models() ?? [])
      : [];
  const spatial = inject(SpatialService, false);
  const geoModels =
    spatial && spatialProvider() === 'postgis' ? spatial.models() : [];
  const parts: string[] = [];
  if (seriesModels.length === 0 && geoModels.length === 0) {
    return { scanPath, built: true, parts };
  }

  const db = inject<PrismaDatabase>(Database as any);
  try {
    if (seriesModels.length > 0) {
      await (store as TimescaleTimeSeries).setup(seriesModels);
      parts.push('time series hypertables');
    }
    if (geoModels.length > 0) {
      await new PostgisSpatialEngine(db).setup(geoModels);
      parts.push('spatial geometry triggers');
    }
  } finally {
    await db.disconnect();
  }
  return { scanPath, built: true, parts };
}
