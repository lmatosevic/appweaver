import path from 'node:path';
import {
  configOverrides,
  Database,
  DatabaseType,
  TimeSeries
} from '@appweaver/common';
import { define, TimeSeriesService } from '@appweaver/core';
import { contractSeriesModel, resetContext } from '@appweaver/testing';

const discoverModules = jest.fn();
const loadProviders = jest.fn();
const loadResources = jest.fn();

jest.mock('@appweaver/core', () => ({
  ...jest.requireActual('@appweaver/core'),
  discoverModules: (...args: any[]) => discoverModules(...args)
}));
jest.mock('@appweaver/core/internal', () => ({
  ...jest.requireActual('@appweaver/core/internal'),
  loadProviders: (...args: any[]) => loadProviders(...args)
}));
jest.mock('../../resource/resource-loader', () => ({
  loadResources: (...args: any[]) => loadResources(...args)
}));

import { setupDatabase } from '../../database/setup-database';
import { PostgisSpatialEngine } from '../../spatial/spatial-engine';
import { SpatialService } from '../../spatial/spatial-service';
import { TimescaleTimeSeries } from '../../timeseries/timescale-time-series';

describe('setup-database', () => {
  const geoModel = { name: 'Store', table: 'Store', fields: { location: {} } };
  let disconnect: jest.Mock;
  let seriesSetup: jest.SpyInstance;
  let geoSetup: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetContext();
    configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
    discoverModules.mockResolvedValue([
      { module: { name: 'billing', resources: '/billing/resources' } },
      { module: { name: 'audit' } }
    ]);
    loadProviders.mockResolvedValue(undefined);
    loadResources.mockResolvedValue(undefined);
    disconnect = jest.fn();
    define({ disconnect }, Database);
    seriesSetup = jest
      .spyOn(TimescaleTimeSeries.prototype, 'setup')
      .mockResolvedValue(undefined);
    geoSetup = jest
      .spyOn(PostgisSpatialEngine.prototype, 'setup')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  const defineModels = (series: unknown[], geo: unknown[]) => {
    define({ models: () => series }, TimeSeriesService);
    define({ models: () => geo }, SpatialService);
  };

  describe('setupDatabase', () => {
    test('loads the models of the build and of the modules', async () => {
      defineModels([], []);

      await setupDatabase({ scanPath: 'packages/data' });

      const scanPath = path.resolve('packages/data');
      expect(discoverModules).toHaveBeenCalledWith({ scanPath });
      expect(loadProviders).toHaveBeenCalledWith(
        await discoverModules.mock.results[0].value,
        scanPath
      );
      expect(loadResources).toHaveBeenCalledWith(scanPath, undefined, [
        '/billing/resources'
      ]);
    });

    test('skips the setup without a build', async () => {
      defineModels([], []);

      await expect(
        setupDatabase({ scanPath: 'missing/dist/src' })
      ).resolves.toEqual({
        scanPath: path.resolve('missing/dist/src'),
        built: false,
        parts: []
      });

      expect(discoverModules).not.toHaveBeenCalled();
    });

    test('sets up the hypertables and the geometry triggers', async () => {
      define(new TimescaleTimeSeries(), TimeSeries);
      defineModels([contractSeriesModel], [geoModel]);

      await expect(
        setupDatabase({ scanPath: 'packages/data' })
      ).resolves.toEqual({
        scanPath: path.resolve('packages/data'),
        built: true,
        parts: ['time series hypertables', 'spatial geometry triggers']
      });

      expect(seriesSetup).toHaveBeenCalledWith([contractSeriesModel]);
      expect(geoSetup).toHaveBeenCalledWith([geoModel]);
      expect(disconnect).toHaveBeenCalled();
    });

    test('sets up nothing without models needing it, without connecting', async () => {
      define(new TimescaleTimeSeries(), TimeSeries);
      defineModels([], []);

      await expect(
        setupDatabase({ scanPath: 'packages/data' })
      ).resolves.toMatchObject({ built: true, parts: [] });

      expect(seriesSetup).not.toHaveBeenCalled();
      expect(geoSetup).not.toHaveBeenCalled();
      expect(disconnect).not.toHaveBeenCalled();
    });

    test('skips the series of another store and the geo fields of the database engine', async () => {
      configOverrides.SPATIAL_PROVIDER = 'database';
      define({}, TimeSeries);
      defineModels([contractSeriesModel], [geoModel]);

      await expect(
        setupDatabase({ scanPath: 'packages/data' })
      ).resolves.toMatchObject({ built: true, parts: [] });

      expect(seriesSetup).not.toHaveBeenCalled();
      expect(geoSetup).not.toHaveBeenCalled();
    });

    test('disconnects when a setup fails', async () => {
      define(new TimescaleTimeSeries(), TimeSeries);
      defineModels([contractSeriesModel], []);
      seriesSetup.mockRejectedValue(new Error('no extension'));

      await expect(
        setupDatabase({ scanPath: 'packages/data' })
      ).rejects.toThrow('no extension');

      expect(disconnect).toHaveBeenCalled();
    });
  });
});
