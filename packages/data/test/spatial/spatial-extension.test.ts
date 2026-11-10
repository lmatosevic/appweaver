import { DbNull, JsonNull } from '@prisma/client/runtime/client';
import {
  configOverrides,
  DatabaseType,
  ErrorCode,
  SpatialError
} from '@appweaver/common';
import { linkModels, resetContext } from '@appweaver/testing';
import { createModel } from '../../factory/create-model';
import { spatialExtension } from '../../spatial/spatial-extension';

const point = { type: 'Point', coordinates: [15.9, 45.8] };

describe('spatial-extension', () => {
  const run = async (
    model: string,
    operation: string,
    args: any,
    result: any = {}
  ) => {
    const query = jest.fn(async () => result);
    const extension = spatialExtension();
    const value = await extension.query.$allModels.$allOperations({
      model,
      operation,
      args,
      query
    });
    return { args: (query.mock.calls[0] as any[])[0], value };
  };

  beforeEach(() => {
    resetContext();
    configOverrides.DATABASE_TYPE = DatabaseType.Sqlite;
    createModel({
      name: 'Store',
      scalars: { name: { type: 'string' } },
      geo: {
        location: { type: 'point' },
        area: { type: 'polygon', required: false }
      },
      relations: { owner: { model: 'Owner', type: 'oneToMany', owner: true } }
    });
    createModel({
      name: 'Owner',
      scalars: { name: { type: 'string' } },
      relations: {
        stores: { model: 'Store', type: 'oneToMany', mappedBy: 'owner' }
      }
    });
    linkModels();
  });

  afterEach(() => {
    delete configOverrides.DATABASE_TYPE;
    delete configOverrides.SPATIAL_PROVIDER;
  });

  describe('spatialExtension', () => {
    test('normalizes a geometry and writes its bounding box', async () => {
      const { args } = await run('Store', 'create', {
        data: { name: 'A', location: { lat: 45.8, lng: 15.9 }, area: null }
      });
      expect(args.data).toEqual({
        name: 'A',
        location: point,
        locationMinLng: 15.9,
        locationMinLat: 45.8,
        locationMaxLng: 15.9,
        locationMaxLat: 45.8,
        area: DbNull,
        areaMinLng: null,
        areaMinLat: null,
        areaMaxLng: null,
        areaMaxLat: null
      });
    });

    test('stores a null sentinel of Prisma as the database null', async () => {
      const { args } = await run('Store', 'update', {
        where: { id: 1 },
        data: { area: JsonNull }
      });
      expect(args.data.area).toBe(DbNull);
      expect(args.data.locationMinLng).toBeUndefined();
    });

    test('normalizes the upserts, the many writes and the nested writes', async () => {
      const upsert = await run('Store', 'upsert', {
        where: { id: 1 },
        create: { name: 'A', location: point },
        update: { location: { lat: 1, lng: 2 } }
      });
      expect(upsert.args.create.locationMinLng).toBe(15.9);
      expect(upsert.args.update.location).toEqual({
        type: 'Point',
        coordinates: [2, 1]
      });

      const many = await run('Store', 'createMany', {
        data: [{ name: 'A', location: { lat: 1, lng: 2 } }]
      });
      expect(many.args.data[0].locationMinLat).toBe(1);

      const nested = await run('Owner', 'create', {
        data: {
          name: 'O',
          stores: { create: [{ name: 'A', location: { lat: 1, lng: 2 } }] }
        }
      });
      expect(nested.args.data.stores.create[0].locationMaxLng).toBe(2);
    });

    test('leaves the bounding box columns out of the results', async () => {
      const { value } = await run(
        'Owner',
        'findFirst',
        {},
        {
          id: 1,
          stores: [{ id: 2, location: point, locationMinLng: 15.9 }]
        }
      );
      expect(value).toEqual({ id: 1, stores: [{ id: 2, location: point }] });
    });

    test('rejects an invalid geometry', async () => {
      const error = await run('Store', 'create', {
        data: { name: 'A', location: { type: 'Point', coordinates: [500, 0] } }
      }).catch((e) => e);
      expect(error).toBeInstanceOf(SpatialError);
      expect(error.code).toBe(ErrorCode.SpatialInvalidGeometry);
      expect(error.details).toEqual({
        model: 'Store',
        field: 'location',
        reason: 'longitude 500 is not between -180 and 180'
      });
    });

    test('writes no bounding box with the postgis provider', async () => {
      configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
      const { args, value } = await run(
        'Store',
        'create',
        { data: { name: 'A', location: point } },
        { id: 1, location: point }
      );
      expect(args.data).toEqual({ name: 'A', location: point });
      expect(value).toEqual({ id: 1, location: point });
    });

    test('passes the queries of a model without geo fields through', async () => {
      const { args } = await run('Owner', 'count', { where: { id: 1 } }, 3);
      expect(args).toEqual({ where: { id: 1 } });
    });
  });
});

describe('spatial-extension without geo fields', () => {
  test('passes every query through', async () => {
    resetContext();
    const query = jest.fn(async (args: any) => args);
    const args = { data: { location: 'x' } };
    await expect(
      spatialExtension().query.$allModels.$allOperations({
        model: 'Store',
        operation: 'create',
        args,
        query
      })
    ).resolves.toBe(args);
  });
});
