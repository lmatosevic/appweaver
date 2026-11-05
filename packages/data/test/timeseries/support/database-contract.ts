import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { configOverrides, Database, DatabaseType } from '@appweaver/common';
import { define } from '@appweaver/core';
import { resetContext, testTimeSeriesContract } from '@appweaver/testing';
import { PrismaDatabase } from '../../../database/prisma-database';
import { DatabaseTimeSeries } from '../../../timeseries/database-time-series';
import { seriesDialect } from '../../../timeseries/utils/series-sql-util';

const TABLES: Record<string, string> = {
  [DatabaseType.Sqlite]:
    'CREATE TABLE %table ("resourceId" INTEGER NOT NULL, "time" DATETIME NOT NULL, ' +
    '"temperature" REAL, "count" INTEGER, "online" BOOLEAN, PRIMARY KEY ("resourceId", "time"))',
  [DatabaseType.PostgreSQL]:
    'CREATE TABLE %table ("resourceId" INTEGER NOT NULL, "time" TIMESTAMP(3) NOT NULL, ' +
    '"temperature" DOUBLE PRECISION, "count" INTEGER, "online" BOOLEAN, PRIMARY KEY ("resourceId", "time"))',
  [DatabaseType.MySQL]:
    'CREATE TABLE %table (`resourceId` INT NOT NULL, `time` DATETIME(3) NOT NULL, ' +
    '`temperature` DOUBLE NULL, `count` INT NULL, `online` BOOLEAN NULL, PRIMARY KEY (`resourceId`, `time`))',
  [DatabaseType.SQLServer]:
    'CREATE TABLE %table ([resourceId] INT NOT NULL, [time] DATETIME2(3) NOT NULL, ' +
    '[temperature] FLOAT NULL, [count] INT NULL, [online] BIT NULL, PRIMARY KEY ([resourceId], [time]))'
};

/**
 * Runs the contract suite on a database, the series table of the suite created first. The databases other than
 * SQLite run when their URL is set: `TIMESERIES_TEST_POSTGRES_URL`, `TIMESERIES_TEST_MYSQL_URL` and
 * `TIMESERIES_TEST_SQLSERVER_URL`, the tables of PostgreSQL in the `schema` of its URL.
 */
export function testDatabaseContract(
  name: string,
  type: DatabaseType,
  url: string | undefined,
  create: () => DatabaseTimeSeries = () => new DatabaseTimeSeries(),
  extra?: (db: () => PrismaDatabase) => void
): void {
  if (!url) {
    return;
  }

  describe(`${name} on ${type}`, () => {
    let db: PrismaDatabase;

    beforeAll(async () => {
      configOverrides.DATABASE_TYPE = type;
      configOverrides.DATABASE_URL = url;
      configOverrides.DATABASE_CLIENT_OUTPUT_DIR_PATH = path.relative(
        process.cwd(),
        clientDir(type)
      );
      resetContext();
      db = new PrismaDatabase();
      define(db, Database);
      // In the schema of the URL, like the tables of the migrations
      const schema =
        type === DatabaseType.PostgreSQL
          ? new URL(url).searchParams.get('schema')
          : null;
      const table = seriesDialect(type, schema ?? undefined).table(
        'ContractSensorSeries'
      );
      if (schema) {
        await db
          .client<any>()
          .$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      }
      await db.client<any>().$executeRawUnsafe(`DROP TABLE IF EXISTS ${table}`);
      await db
        .client<any>()
        .$executeRawUnsafe(TABLES[type].replace('%table', table));
    }, 60_000);

    afterAll(async () => {
      await db.disconnect();
      delete configOverrides.DATABASE_TYPE;
      delete configOverrides.DATABASE_URL;
      delete configOverrides.DATABASE_CLIENT_OUTPUT_DIR_PATH;
    });

    testTimeSeriesContract(name, create);
    extra?.(() => db);
  });
}

// Inside the repository, so a generated client resolves the Prisma runtime
export const dir = path.join(
  process.cwd(),
  'temp',
  `timeseries-${process.pid}`
);
fs.mkdirSync(dir, { recursive: true });

/** The Prisma client of a database type: the one of data on SQLite, otherwise one generated without any model. */
function clientDir(type: DatabaseType): string {
  if (type === DatabaseType.Sqlite) {
    return path.join(__dirname, '../../../prisma/client');
  }

  const output = path.join(dir, type, 'client');
  const schemaPath = path.join(dir, type, 'schema.prisma');
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(
    schemaPath,
    `datasource db {\n  provider = "${type}"\n}\n\ngenerator client {\n  provider = "prisma-client"\n  output = "${output}"\n}\n`
  );
  execFileSync('npx', ['prisma', 'generate', '--schema', schemaPath], {
    stdio: 'ignore'
  });
  return output;
}
