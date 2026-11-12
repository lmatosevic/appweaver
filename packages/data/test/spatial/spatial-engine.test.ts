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
  geometryTrigger,
  PostgisSpatialEngine
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

    test('narrows by the two boxes of a distance crossing the antimeridian', async () => {
      const { stub, engine: db } = engine([
        { id: 1, location: point(-179.95, 0) }
      ]);
      const matches = await db.match(
        model,
        'location',
        spatialCondition('_near', { point: [179.95, 0], maxDistance: 20_000 }),
        10
      );
      expect(matches.map((match) => match.id)).toEqual([1]);
      expect(stub.lastQuery('findMany').args.where.OR).toHaveLength(2);
    });

    test('narrows a covered geometry inside the box, an overlapping one across it', async () => {
      const { stub, engine: db } = engine([
        { id: 1, area: boxPolygon([1, 1, 2, 2]) }
      ]);
      const within = await db.match(
        model,
        'area',
        spatialCondition('_within', boxPolygon([0, 0, 5, 5])),
        10
      );
      expect(within).toEqual([{ id: 1 }]);
      expect(stub.lastQuery('findMany').args.where).toEqual({
        areaMinLng: { gte: 0, lte: 5 },
        areaMinLat: { gte: 0, lte: 5 },
        areaMaxLng: { lte: 5 },
        areaMaxLat: { lte: 5 }
      });

      const intersects = await db.match(
        model,
        'area',
        spatialCondition('_intersects', point(1.5, 1.5)),
        10
      );
      expect(intersects).toEqual([{ id: 1 }]);
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
      const condition = spatialCondition('_within', boxPolygon([-1, -1, 1, 1]));

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
    const database = (
      extension: unknown[] = [{ extversion: '3.4' }],
      triggers: unknown[] = []
    ) => {
      const tx = {
        $executeRawUnsafe: jest.fn(),
        $queryRawUnsafe: jest.fn(async () => triggers)
      };
      const client = { $queryRawUnsafe: jest.fn(async () => extension) };
      const db: any = {
        client: () => client,
        transaction: jest.fn(async (fn: any) => fn(tx))
      };
      return { db, tx, client };
    };

    afterEach(() => {
      for (const key of Object.keys(configOverrides)) {
        delete configOverrides[key];
      }
    });

    test('creates the missing triggers in the schema of the connection', async () => {
      configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
      configOverrides.DATABASE_URL = 'postgresql://u:p@h/db?schema=geo';
      configOverrides.SPATIAL_SETUP_TIMEOUT = 1234;
      const { db, tx } = database();
      await new PostgisSpatialEngine(db).setup([model]);

      expect(db.transaction.mock.calls[0][1]).toEqual({ timeout: 1234 });
      expect(tx.$queryRawUnsafe.mock.calls[0]).toEqual([
        expect.stringContaining(`|| '_geo_sync'`),
        'geo'
      ]);
      const statements = tx.$executeRawUnsafe.mock.calls.map((c) => c[0]);
      expect(statements[0]).toContain('pg_advisory_xact_lock');
      expect(statements.slice(1)).toEqual(
        geometryTrigger('Store', ['location', 'area'], 'geo').statements
      );
      expect(statements[1]).toContain(
        'CREATE OR REPLACE FUNCTION "geo"."Store_geo_sync"()'
      );
    });

    test('leaves a trigger in place alone, and replaces an outdated one', async () => {
      configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
      const trigger = geometryTrigger('Store', ['location', 'area']);

      const current = database(undefined, [
        { table: 'Store', source: trigger.source }
      ]);
      await new PostgisSpatialEngine(current.db).setup([model]);
      expect(current.tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);

      const outdated = database(undefined, [
        { table: 'Store', source: geometryTrigger('Store', ['area']).source }
      ]);
      await new PostgisSpatialEngine(outdated.db).setup([model]);
      expect(outdated.tx.$executeRawUnsafe).toHaveBeenCalledTimes(
        1 + trigger.statements.length
      );
      // Without a schema in the URL, the one of the connection
      expect(outdated.tx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.any(String),
        null
      );
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
      expect(sql).toContain(
        'WHERE ("locationGeom" && ST_MakeEnvelope($1::float8, $2::float8, $3::float8, $4::float8, 4326)) AND ' +
          'ST_DWithin("locationGeom"::geography'
      );
      expect(sql).toContain('ORDER BY "distance", "id" LIMIT 6');
      expect(params.slice(4)).toEqual([1, 2, 100, 10]);

      // Two boxes on the sides of the antimeridian
      await engine.match(
        model,
        'location',
        spatialCondition('_near', { point: [179.99, 0], maxDistance: 5000 }),
        5
      );
      const wrapped = client.$queryRawUnsafe.mock.calls.at(-1) as any[];
      expect(wrapped[0]).toContain(') OR "locationGeom" && ST_MakeEnvelope(');
      expect(wrapped).toHaveLength(1 + 8 + 3);

      client.$queryRawUnsafe.mockResolvedValue([{ id: 2 }]);
      for (const [operator, value, fn] of [
        ['_within', boxPolygon([0, 0, 1, 1]), 'ST_CoveredBy'],
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

  describe('geometryTrigger', () => {
    test('writes the geometry of each field on an insert and on a change', () => {
      const { source, statements } = geometryTrigger('Store', ['location']);
      expect(source).toContain(
        `  IF TG_OP = 'INSERT' THEN\n    NEW."locationGeom" := CASE WHEN jsonb_typeof(NEW."location"::jsonb) = 'object'`
      );
      expect(source).toContain(
        'IF NEW."location" IS DISTINCT FROM OLD."location" THEN'
      );
      expect(source).toContain('EXCEPTION WHEN undefined_column THEN');
      expect(statements).toEqual([
        `CREATE OR REPLACE FUNCTION "Store_geo_sync"() RETURNS trigger AS $$${source}$$ LANGUAGE plpgsql`,
        'DROP TRIGGER IF EXISTS "Store_geo_sync" ON "Store"',
        'CREATE TRIGGER "Store_geo_sync" BEFORE INSERT OR UPDATE ON "Store" FOR EACH ROW EXECUTE FUNCTION "Store_geo_sync"()',
        expect.stringMatching(
          /^UPDATE "Store" SET "locationGeom" = CASE .* WHERE "locationGeom" IS NULL AND jsonb_typeof\("location"::jsonb\) = 'object'$/
        )
      ]);
    });

    test('keeps the name of a long table within the limit of PostgreSQL', () => {
      const { statements } = geometryTrigger('T'.repeat(60), ['location']);
      expect(statements[1]).toContain(`"${'T'.repeat(50)}_geo_sync"`);
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
    let engine: PostgisSpatialEngine;

    const query = <T = any>(sql: string): Promise<T[]> =>
      db.client<any>().$queryRawUnsafe(sql);
    const execute = (sql: string): Promise<unknown> =>
      db.client<any>().$executeRawUnsafe(sql);
    const triggerOid = async () =>
      (
        await query(
          `SELECT oid::text AS oid FROM pg_trigger WHERE tgname = 'SpatialContract_geo_sync'`
        )
      )[0]?.oid;

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
      engine = new PostgisSpatialEngine(db);
      await execute('CREATE EXTENSION IF NOT EXISTS postgis');
      await execute('DROP TABLE IF EXISTS "SpatialContract"');
      await execute(
        'CREATE TABLE "SpatialContract" ("id" SERIAL PRIMARY KEY, "name" TEXT, "location" JSONB NOT NULL, ' +
          '"locationGeom" geometry(Point, 4326), "area" JSONB, "areaGeom" geometry(Polygon, 4326))'
      );
      // Before the trigger exists
      await execute(
        `INSERT INTO "SpatialContract" ("location") VALUES ('{"type":"Point","coordinates":[0,0]}')`
      );
    }, 120_000);

    afterAll(async () => {
      await execute('DROP TABLE IF EXISTS "SpatialContract"');
      await execute('DROP FUNCTION IF EXISTS "SpatialContract_geo_sync"()');
      await db.disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
      delete configOverrides.DATABASE_TYPE;
      delete configOverrides.DATABASE_URL;
      delete configOverrides.DATABASE_CLIENT_OUTPUT_DIR_PATH;
    });

    test('creates the trigger once and writes the geometries missing', async () => {
      await engine.setup([table]);
      const oid = await triggerOid();
      expect(oid).toBeDefined();

      // A second start finds the trigger in place
      await engine.setup([table]);
      expect(await triggerOid()).toBe(oid);

      expect(
        await query(
          'SELECT ST_AsText("locationGeom") AS geom FROM "SpatialContract"'
        )
      ).toEqual([{ geom: 'POINT(0 0)' }]);
    }, 60_000);

    test('keeps the geometries in line with the GeoJSON', async () => {
      await execute(
        `INSERT INTO "SpatialContract" ("location", "area") VALUES ` +
          `('{"type":"Point","coordinates":[0,1]}', '${JSON.stringify(boxPolygon([-1, -1, 1, 1]))}'), ` +
          `('{"type":"Point","coordinates":[0,3]}', 'null')`
      );
      const geometries = () =>
        query(
          'SELECT ST_AsText("locationGeom") AS geom, ST_AsText("areaGeom") AS area FROM "SpatialContract" ORDER BY "id"'
        );
      expect(await geometries()).toEqual([
        { geom: 'POINT(0 0)', area: null },
        { geom: 'POINT(0 1)', area: 'POLYGON((-1 -1,1 -1,1 1,-1 1,-1 -1))' },
        { geom: 'POINT(0 3)', area: null }
      ]);

      // A change of the GeoJSON, a JSON null, and a write of another column
      await execute(
        `UPDATE "SpatialContract" SET "location" = '{"type":"Point","coordinates":[5,5]}', "area" = 'null' WHERE "id" = 2`
      );
      await execute(`UPDATE "SpatialContract" SET "name" = 'x'`);
      expect((await geometries())[1]).toEqual({
        geom: 'POINT(5 5)',
        area: null
      });
      await execute(
        `UPDATE "SpatialContract" SET "location" = '{"type":"Point","coordinates":[0,1]}', ` +
          `"area" = '${JSON.stringify(boxPolygon([-1, -1, 1, 1]))}' WHERE "id" = 2`
      );
    });

    test('matches the geometries like the database engine', async () => {
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
        spatialCondition('_within', boxPolygon([-1, -1, 1, 1])),
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

      await execute(
        `INSERT INTO "SpatialContract" ("location") VALUES ('{"type":"Point","coordinates":[-179.95,60]}')`
      );
      const wrapped = await engine.match(
        table,
        'location',
        spatialCondition('_near', { point: [179.95, 60], maxDistance: 10_000 }),
        10
      );
      expect(wrapped.map((match) => match.id)).toEqual([4]);
    });

    test('replaces the trigger of a model whose geo fields changed', async () => {
      const oid = await triggerOid();
      await engine.setup([
        { ...table, fields: { location: table.fields.location } }
      ]);
      expect(await triggerOid()).not.toBe(oid);
      await engine.setup([table]);
    });

    test('lets a migration drop a geo field the trigger still names', async () => {
      await execute(
        'ALTER TABLE "SpatialContract" DROP COLUMN "area", DROP COLUMN "areaGeom"'
      );
      await execute(
        `INSERT INTO "SpatialContract" ("location") VALUES ('{"type":"Point","coordinates":[7,7]}')`
      );
      // The next start replaces the trigger and writes the geometry it missed
      await engine.setup([
        { ...table, fields: { location: table.fields.location } }
      ]);
      expect(
        await query(
          'SELECT ST_AsText("locationGeom") AS geom FROM "SpatialContract" ORDER BY "id" DESC LIMIT 1'
        )
      ).toEqual([{ geom: 'POINT(7 7)' }]);
    });
  }
);
