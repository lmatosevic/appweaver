import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  boxPolygon,
  ConfigurationError,
  configOverrides,
  DatabaseType,
  spatialCondition
} from '@appweaver/common';
import { createDatabaseStub, resetContext } from '@appweaver/testing';
import { PrismaDatabase } from '../../database/prisma-database';
import {
  DatabaseSpatialEngine,
  GeoModel,
  PostgisSpatialEngine,
  triggerStatements
} from '../../spatial/spatial-engine';

const model: GeoModel = {
  name: 'Store',
  table: 'Store',
  fields: { location: { type: 'point' }, area: { type: 'polygon' } }
};

const point = (lng: number, lat: number) => ({
  type: 'Point',
  coordinates: [lng, lat]
});

describe('spatial-engine', () => {
  describe('DatabaseSpatialEngine', () => {
    const engine = (rows: any[] | ((args: any) => any[])) => {
      const stub = createDatabaseStub(['Store']);
      stub.setResult(
        'Store',
        'findMany',
        typeof rows === 'function' ? rows : () => rows
      );
      return {
        stub,
        engine: new DatabaseSpatialEngine(stub.database as any)
      };
    };

    test('narrows the points by their bounding box, then matches them', async () => {
      const { stub, engine: db } = engine([
        { id: 1, location: point(0, 0.5) },
        { id: 2, location: point(0, 0.1) },
        { id: 3, location: point(0, 3) },
        { id: 4, location: null }
      ]);
      await db.setup();
      const matches = await db.match(
        model,
        'location',
        spatialCondition('_near', { point: [0, 0], maxDistance: 100_000 }),
        10
      );
      expect(matches.map((match) => match.id)).toEqual([2, 1]);
      expect(matches[0].distance).toBeCloseTo(11_119.5, 0);

      const { where, select } = stub.lastQuery('findMany').args;
      expect(select).toEqual({ id: true, location: true });
      expect(Object.keys(where)).toEqual(['locationMinLng', 'locationMinLat']);
      expect(where.locationMinLat.gte).toBeCloseTo(-0.8993, 4);
    });

    test('narrows a covered geometry inside the box, an overlapping one across it', async () => {
      const { stub, engine: db } = engine([
        { id: 1, area: boxPolygon([1, 1, 2, 2]) }
      ]);
      await db.match(
        model,
        'area',
        spatialCondition('_withinBox', [0, 0, 5, 5]),
        10
      );
      expect(stub.lastQuery('findMany').args.where).toEqual({
        areaMinLng: { gte: 0, lte: 5 },
        areaMinLat: { gte: 0, lte: 5 },
        areaMaxLng: { lte: 5 },
        areaMaxLat: { lte: 5 }
      });

      const matches = await db.match(
        model,
        'area',
        spatialCondition('_intersects', point(1.5, 1.5)),
        10
      );
      expect(matches).toEqual([{ id: 1 }]);
      expect(stub.lastQuery('findMany').args.where).toEqual({
        areaMinLng: { lte: 1.5 },
        areaMinLat: { lte: 1.5 },
        areaMaxLng: { gte: 1.5 },
        areaMaxLat: { gte: 1.5 }
      });
    });

    test('reads the records in batches, and stops past the limit', async () => {
      const batch = (from: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: from + i,
          location: point(0, 0)
        }));
      const { stub, engine: db } = engine((args) =>
        args.cursor ? batch(1001, 5) : batch(1, 1000)
      );
      const condition = spatialCondition('_withinBox', [-1, -1, 1, 1]);

      expect(await db.match(model, 'location', condition, 2000)).toHaveLength(
        1005
      );
      const second = stub.queries.filter((q) => q.method === 'findMany')[1];
      expect(second.args).toMatchObject({ cursor: { id: 1000 }, skip: 1 });

      stub.queries.length = 0;
      expect(await db.match(model, 'location', condition, 10)).toHaveLength(
        1000
      );
      expect(stub.queries).toHaveLength(1);
    });
  });

  describe('PostgisSpatialEngine', () => {
    const database = (extension: unknown[] = [{ extversion: '3.4' }]) => {
      const tx = { $executeRawUnsafe: jest.fn() };
      const client = { $queryRawUnsafe: jest.fn(async () => extension) };
      const db: any = {
        client: () => client,
        transaction: async (fn: any) => fn(tx)
      };
      return { db, tx, client };
    };

    afterEach(() => {
      delete configOverrides.DATABASE_TYPE;
      delete configOverrides.DATABASE_URL;
    });

    test('creates the triggers in the schema of the connection', async () => {
      configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
      configOverrides.DATABASE_URL = 'postgresql://u:p@h/db?schema=geo';
      const { db, tx } = database();
      await new PostgisSpatialEngine(db).setup([model]);

      const statements = tx.$executeRawUnsafe.mock.calls.map((c) => c[0]);
      expect(statements[0]).toContain('pg_advisory_xact_lock');
      expect(statements[1]).toContain(
        'CREATE OR REPLACE FUNCTION "geo"."appweaver_geo_sync"()'
      );
      expect(statements[3]).toBe(
        'CREATE TRIGGER "Store_geo_sync" BEFORE INSERT OR UPDATE ON "geo"."Store" ' +
          `FOR EACH ROW EXECUTE FUNCTION "geo"."appweaver_geo_sync"('location', 'area')`
      );
      expect(statements).toHaveLength(6);
    });

    test('sets nothing up without a model, and fails without PostGIS', async () => {
      const { db, client } = database([]);
      await new PostgisSpatialEngine(db).setup([]);
      expect(client.$queryRawUnsafe).not.toHaveBeenCalled();

      await expect(
        new PostgisSpatialEngine(db).setup([model])
      ).rejects.toBeInstanceOf(ConfigurationError);
    });

    test('queries the matches with the functions of PostGIS', async () => {
      const { db, client } = database();
      const engine = new PostgisSpatialEngine(db);
      client.$queryRawUnsafe.mockResolvedValue([{ id: 1, distance: '12.5' }]);

      const near = await engine.match(
        model,
        'location',
        spatialCondition('_near', {
          point: [1, 2],
          maxDistance: 100,
          minDistance: 10
        }),
        5
      );
      expect(near).toEqual([{ id: 1, distance: 12.5 }]);
      const [sql, ...params] = (client.$queryRawUnsafe.mock.calls as any[])[0];
      expect(sql).toContain('ST_DWithin("locationGeom"::geography');
      expect(sql).toContain('ORDER BY "distance", "id" LIMIT 6');
      expect(params.slice(4)).toEqual([1, 2, 100, 10]);

      client.$queryRawUnsafe.mockResolvedValue([{ id: 2 }]);
      for (const [operator, value, fn] of [
        ['_within', boxPolygon([0, 0, 1, 1]), 'ST_CoveredBy'],
        ['_withinBox', [0, 0, 1, 1], 'ST_CoveredBy'],
        ['_intersects', point(0, 0), 'ST_Intersects']
      ] as const) {
        const matches = await engine.match(
          model,
          'area',
          spatialCondition(operator, value),
          5
        );
        expect(matches).toEqual([{ id: 2 }]);
        const call = client.$queryRawUnsafe.mock.calls.at(-1) as any[];
        expect(call[0]).toContain(`${fn}("areaGeom"`);
        expect(call[0]).toContain('ORDER BY "id" LIMIT 6');
      }
    });
  });

  describe('triggerStatements', () => {
    test('replaces the trigger of a table and fills the missing geometries', () => {
      const statements = triggerStatements('"Store"', 'Store', '"fn"', [
        'location'
      ]);
      expect(statements).toEqual([
        'DROP TRIGGER IF EXISTS "Store_geo_sync" ON "Store"',
        `CREATE TRIGGER "Store_geo_sync" BEFORE INSERT OR UPDATE ON "Store" FOR EACH ROW EXECUTE FUNCTION "fn"('location')`,
        'UPDATE "Store" SET "locationGeom" = ST_SetSRID(ST_GeomFromGeoJSON("location"::jsonb), 4326) ' +
          `WHERE "locationGeom" IS NULL AND jsonb_typeof("location"::jsonb) = 'object'`
      ]);
    });
  });
});

const postgisUrl = process.env.SPATIAL_TEST_POSTGIS_URL;

/**
 * Runs the PostGIS engine on a database of `SPATIAL_TEST_POSTGIS_URL`, with the PostGIS extension available, the
 * table of the test created first.
 */
(postgisUrl ? describe : describe.skip)(
  'PostgisSpatialEngine on PostGIS',
  () => {
    const dir = path.join(process.cwd(), 'temp', `spatial-${process.pid}`);
    const table: GeoModel = { ...model, table: 'SpatialContract' };
    let db: PrismaDatabase;

    beforeAll(async () => {
      const output = path.join(dir, 'client');
      const schemaPath = path.join(dir, 'schema.prisma');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        schemaPath,
        `datasource db {\n  provider = "postgresql"\n}\n\ngenerator client {\n  provider = "prisma-client"\n  output = "${output.replace(/\\/g, '/')}"\n}\n`
      );
      execSync(`npx prisma generate --schema "${schemaPath}"`, {
        stdio: 'ignore'
      });

      configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
      configOverrides.DATABASE_URL = postgisUrl!;
      configOverrides.DATABASE_CLIENT_OUTPUT_DIR_PATH = path.relative(
        process.cwd(),
        output
      );
      resetContext();
      db = new PrismaDatabase();
      const client = db.client<any>();
      await client.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis');
      await client.$executeRawUnsafe('DROP TABLE IF EXISTS "SpatialContract"');
      await client.$executeRawUnsafe(
        'CREATE TABLE "SpatialContract" ("id" SERIAL PRIMARY KEY, "location" JSONB NOT NULL, ' +
          '"locationGeom" geometry(Point, 4326), "area" JSONB, "areaGeom" geometry(Polygon, 4326))'
      );
      await client.$executeRawUnsafe(
        `INSERT INTO "SpatialContract" ("location") VALUES ('{"type":"Point","coordinates":[0,0]}')`
      );
    }, 120_000);

    afterAll(async () => {
      await db
        .client<any>()
        .$executeRawUnsafe('DROP TABLE IF EXISTS "SpatialContract"');
      await db.disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
      delete configOverrides.DATABASE_TYPE;
      delete configOverrides.DATABASE_URL;
      delete configOverrides.DATABASE_CLIENT_OUTPUT_DIR_PATH;
    });

    test('writes the geometries and matches them like the database engine', async () => {
      const engine = new PostgisSpatialEngine(db);
      await engine.setup([table]);
      // Twice, as the instances starting together do
      await engine.setup([table]);

      const client = db.client<any>();
      await client.$executeRawUnsafe(
        `INSERT INTO "SpatialContract" ("location", "area") VALUES ` +
          `('{"type":"Point","coordinates":[0,1]}', '${JSON.stringify(boxPolygon([-1, -1, 1, 1]))}'), ` +
          `('{"type":"Point","coordinates":[0,3]}', 'null')`
      );
      const geoms: { geom: string }[] = await client.$queryRawUnsafe(
        'SELECT ST_AsText("locationGeom") AS geom FROM "SpatialContract" ORDER BY "id"'
      );
      // The record before the trigger filled by the setup
      expect(geoms.map((row) => row.geom)).toEqual([
        'POINT(0 0)',
        'POINT(0 1)',
        'POINT(0 3)'
      ]);

      const near = await engine.match(
        table,
        'location',
        spatialCondition('_near', { point: [0, 0], maxDistance: 200_000 }),
        10
      );
      expect(near.map((match) => match.id)).toEqual([1, 2]);
      expect(near[1].distance).toBeCloseTo(111_195, -1);

      const within = await engine.match(
        table,
        'location',
        spatialCondition('_withinBox', [-1, -1, 1, 1]),
        10
      );
      expect(within.map((match) => match.id)).toEqual([1, 2]);

      const intersects = await engine.match(
        table,
        'area',
        spatialCondition('_intersects', point(0.5, 0.5)),
        10
      );
      expect(intersects.map((match) => match.id)).toEqual([2]);

      // An update keeps the geometry in line, a JSON null clears it
      await client.$executeRawUnsafe(
        `UPDATE "SpatialContract" SET "location" = '{"type":"Point","coordinates":[5,5]}', "area" = 'null' WHERE "id" = 2`
      );
      const updated: unknown[] = await client.$queryRawUnsafe(
        'SELECT ST_AsText("locationGeom") AS geom, ST_AsText("areaGeom") AS area FROM "SpatialContract" WHERE "id" = 2'
      );
      expect(updated).toEqual([{ geom: 'POINT(5 5)', area: null }]);
    }, 60_000);

    test('lets a migration drop a geo field the trigger still names', async () => {
      const client = db.client<any>();
      await client.$executeRawUnsafe(
        'ALTER TABLE "SpatialContract" DROP COLUMN "area", DROP COLUMN "areaGeom"'
      );
      await client.$executeRawUnsafe(
        `INSERT INTO "SpatialContract" ("location") VALUES ('{"type":"Point","coordinates":[7,7]}')`
      );
      const rows: unknown[] = await client.$queryRawUnsafe(
        'SELECT ST_AsText("locationGeom") AS geom FROM "SpatialContract" ORDER BY "id" DESC LIMIT 1'
      );
      expect(rows).toEqual([{ geom: 'POINT(7 7)' }]);
    });
  }
);
