import {
  boxPolygon,
  ConfigurationError,
  configOverrides,
  Database,
  DatabaseType,
  ErrorCode,
  logger,
  SpatialCondition,
  SpatialError
} from '@appweaver/common';
import { define } from '@appweaver/core';
import {
  createDatabaseStub,
  DatabaseStub,
  linkModels,
  resetContext
} from '@appweaver/testing';
import { createModel } from '../../factory/create-model';
import { ResolvedFilterConditions } from '../../resource/utils/filter-util';
import { FINGERPRINT } from '../../resource/utils/cursor-util';
import {
  DatabaseSpatialEngine,
  PostgisSpatialEngine
} from '../../spatial/spatial-engine';
import { SpatialService } from '../../spatial/spatial-service';

const near = { point: [0, 0], maxDistance: 1000 };
const condition: SpatialCondition = {
  operator: 'within',
  geometry: boxPolygon([0, 0, 1, 1])
};

describe('spatial-service', () => {
  let db: DatabaseStub;
  let service: SpatialService;
  let match: jest.SpyInstance;

  beforeEach(() => {
    resetContext();
    configOverrides.DATABASE_TYPE = DatabaseType.Sqlite;
    db = createDatabaseStub(['Store', 'Owner']);
    define(db.database, Database as any);
    createModel({
      name: 'Store',
      scalars: { name: { type: 'string' } },
      geo: { location: { type: 'point' } },
      relations: { owner: { model: 'Owner', type: 'oneToMany', owner: true } }
    });
    createModel({
      name: 'Owner',
      geo: { home: { type: 'point', required: false } },
      relations: {
        stores: { model: 'Store', type: 'oneToMany', mappedBy: 'owner' }
      },
      files: { avatar: {} }
    });
    linkModels();
    service = new SpatialService();
    match = jest
      .spyOn(DatabaseSpatialEngine.prototype, 'match')
      .mockResolvedValue([
        { id: 2, distance: 5 },
        { id: 1, distance: 9 }
      ]);
  });

  afterEach(() => {
    match.mockRestore();
    for (const key of Object.keys(configOverrides)) {
      if (key.startsWith('SPATIAL_') || key.startsWith('DATABASE_')) {
        delete configOverrides[key];
      }
    }
  });

  describe('resolveFilter', () => {
    test('resolves a geo field into the ids it matches', async () => {
      const { filter, distances } = await service.resolveFilter(
        { name: 'A', location: { _near: near } },
        'Store'
      );
      expect(filter.name).toBe('A');
      expect(filter.location).toBeInstanceOf(ResolvedFilterConditions);
      const [condition] = filter.location.conditions;
      expect(condition).toEqual({ id: { in: [2, 1] } });
      expect(condition.id.in[FINGERPRINT]).toEqual({
        location: { _near: near }
      });
      expect([...distances.get('location')!]).toEqual([
        [2, 5],
        [1, 9]
      ]);
      expect(match.mock.calls[0][1]).toBe('location');
      expect(match.mock.calls[0][3]).toBe(10000);
    });

    test('resolves the logical operators and the relations, keeping the top level distances', async () => {
      const { filter, distances } = await service.resolveFilter(
        {
          _or: [{ location: { _within: boxPolygon([0, 0, 1, 1]) } }],
          _not: { location: { _near: near } },
          owner: {
            home: { _near: near },
            name: 'O',
            stores: { _some: { location: { _near: near } } }
          },
          avatar: { name: 'a.png' }
        },
        'Store'
      );
      expect(filter._or[0].location).toBeInstanceOf(ResolvedFilterConditions);
      expect(filter._not.location).toBeInstanceOf(ResolvedFilterConditions);
      expect(filter.owner.home).toBeInstanceOf(ResolvedFilterConditions);
      expect(filter.owner.name).toBe('O');
      expect(filter.owner.stores._some.location).toBeInstanceOf(
        ResolvedFilterConditions
      );
      expect(filter.avatar).toEqual({ name: 'a.png' });
      expect(distances.size).toBe(0);
      expect(match.mock.calls.map((call) => call[0].name)).toEqual([
        'Store',
        'Store',
        'Owner',
        'Store'
      ]);
    });

    test('checks a box and the existence with the bounding box columns', async () => {
      const { filter, distances } = await service.resolveFilter(
        {
          location: null,
          _and: [
            { location: { _exists: true, _withinBox: [0, 1, 5, 6] } },
            { location: { _exists: 'false' } },
            { location: { _withinBox: [170, 0, -170, 1] } }
          ]
        },
        'Store'
      );
      expect(filter.location.conditions).toEqual([{ locationMinLng: null }]);
      expect(filter._and[0].location.conditions).toEqual([
        { locationMinLng: { not: null } },
        {
          locationMinLng: { gte: 0, lte: 5 },
          locationMinLat: { gte: 1, lte: 6 },
          locationMaxLng: { lte: 5 },
          locationMaxLat: { lte: 6 }
        }
      ]);
      expect(filter._and[1].location.conditions).toEqual([
        { locationMinLng: null }
      ]);
      expect(filter._and[2].location.conditions[0].OR).toHaveLength(2);
      // No engine, so no limit of matches
      expect(match).not.toHaveBeenCalled();
      expect(distances.size).toBe(0);
    });

    test('leaves a filter without geo models or of another type unchanged', async () => {
      expect(await service.resolveFilter('x', 'Store')).toEqual({
        filter: 'x',
        distances: new Map()
      });
      resetContext();
      const filter = { location: { _near: near } };
      expect((await service.resolveFilter(filter, 'Store')).filter).toBe(
        filter
      );
    });

    test('rejects the invalid geo conditions', async () => {
      for (const value of [
        5,
        { _eq: 1 },
        { _withinBox: [0, 1, 1, 0] },
        { _near: { point: [0, 0], maxDistance: -5 } }
      ]) {
        const error = await service
          .resolveFilter({ location: value }, 'Store')
          .catch((e) => e);
        expect(error).toBeInstanceOf(SpatialError);
        expect(error.code).toBe(ErrorCode.SpatialInvalidFilter);
        expect(error.details.field).toBe('location');
      }
    });
  });

  describe('match', () => {
    test('rejects a field that is no geo field', async () => {
      await expect(
        service.match('Store', 'name', condition)
      ).rejects.toMatchObject({ code: ErrorCode.SpatialInvalidFilter });
    });

    test('rejects a condition matching more records than the maximum', async () => {
      configOverrides.SPATIAL_MAX_CANDIDATES = 1;
      await expect(
        service.match('Store', 'location', condition)
      ).rejects.toMatchObject({
        code: ErrorCode.SpatialTooManyCandidates,
        details: { model: 'Store', field: 'location', maxCandidates: 1 }
      });
    });
  });

  describe('onInit', () => {
    test('sets the engine up once, again after a failure', async () => {
      const setup = jest
        .spyOn(PostgisSpatialEngine.prototype, 'setup')
        .mockRejectedValueOnce(new Error('unreachable'))
        .mockResolvedValue(undefined);
      configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
      const error = jest.spyOn(logger, 'error').mockImplementation();
      const postgisMatch = jest
        .spyOn(PostgisSpatialEngine.prototype, 'match')
        .mockResolvedValue([]);

      await service.onInit();
      expect(setup).toHaveBeenCalledTimes(1);

      await service.match('Store', 'location', condition);
      await service.match('Store', 'location', condition);
      expect(setup).toHaveBeenCalledTimes(2);
      setup.mockRestore();
      error.mockRestore();
      postgisMatch.mockRestore();
    });

    test('fails the start on an invalid setup, and skips an app without geo fields', async () => {
      const setup = jest
        .spyOn(DatabaseSpatialEngine.prototype, 'setup')
        .mockRejectedValue(
          new ConfigurationError(ErrorCode.ConfigurationInvalid, 'x')
        );
      await expect(service.onInit()).rejects.toBeInstanceOf(ConfigurationError);
      resetContext();
      define(db.database, Database as any);
      await expect(new SpatialService().onInit()).resolves.toBeUndefined();
      setup.mockRestore();
    });
  });
});
