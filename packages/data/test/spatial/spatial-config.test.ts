import {
  ConfigurationError,
  configOverrides,
  DatabaseType
} from '@appweaver/common';
import {
  spatialConfig,
  spatialMaxCandidates,
  spatialProvider
} from '../../spatial/spatial-config';

describe('spatial-config', () => {
  afterEach(() => {
    delete configOverrides.DATABASE_TYPE;
    delete configOverrides.SPATIAL_PROVIDER;
    delete configOverrides.SPATIAL_MAX_CANDIDATES;
  });

  describe('spatialProvider', () => {
    test('picks PostGIS on PostgreSQL, the database engine otherwise', () => {
      configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
      expect(spatialProvider()).toBe('postgis');
      configOverrides.SPATIAL_PROVIDER = 'database';
      expect(spatialProvider()).toBe('database');
      configOverrides.DATABASE_TYPE = DatabaseType.MySQL;
      configOverrides.SPATIAL_PROVIDER = 'auto';
      expect(spatialProvider()).toBe('database');
      expect(spatialConfig.MAX_VERTICES).toBe(10000);
    });

    test('rejects PostGIS on another database', () => {
      configOverrides.DATABASE_TYPE = DatabaseType.SQLServer;
      configOverrides.SPATIAL_PROVIDER = 'postgis';
      expect(() => spatialProvider()).toThrow(ConfigurationError);
    });
  });

  describe('spatialMaxCandidates', () => {
    test('keeps SQL Server under its limit of parameters', () => {
      configOverrides.DATABASE_TYPE = DatabaseType.SQLServer;
      expect(spatialMaxCandidates()).toBe(2000);
      configOverrides.SPATIAL_MAX_CANDIDATES = 500;
      expect(spatialMaxCandidates()).toBe(500);
      configOverrides.DATABASE_TYPE = DatabaseType.Sqlite;
      expect(spatialMaxCandidates()).toBe(500);
    });
  });
});
