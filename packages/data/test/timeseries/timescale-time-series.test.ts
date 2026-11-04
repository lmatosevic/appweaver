import fs from 'node:fs';
import {
  configOverrides,
  Database,
  DatabaseType,
  ErrorCode
} from '@appweaver/common';
import { define } from '@appweaver/core';
import { contractSeriesModel, resetContext } from '@appweaver/testing';
import { TimescaleTimeSeries } from '../../timeseries/timescale-time-series';
import { dir, testDatabaseContract } from './support/database-contract';

// Runs on a TimescaleDB database when its URL is set
testDatabaseContract(
  'TimescaleTimeSeries',
  DatabaseType.PostgreSQL,
  process.env.TIMESERIES_TEST_TIMESCALE_URL,
  () => new TimescaleTimeSeries(),
  (db) => {
    const jobs = async () =>
      (
        await db()
          .client<any>()
          .$queryRawUnsafe(
            `SELECT proc_name, config FROM timescaledb_information.jobs
             WHERE hypertable_name = 'ContractSensorSeries' ORDER BY proc_name`
          )
      ).map((job: any) => [
        job.proc_name,
        job.config.compress_after ?? job.config.drop_after
      ]);

    test('turns the series table into a hypertable', async () => {
      const store = new TimescaleTimeSeries();
      await store.register([contractSeriesModel]);

      const tables = await db()
        .client<any>()
        .$queryRawUnsafe(
          `SELECT hypertable_name FROM timescaledb_information.hypertables
           WHERE hypertable_name = 'ContractSensorSeries'`
        );
      expect(tables).toHaveLength(1);
    });

    test('keeps the compression and retention policies in line with the model', async () => {
      const store = new TimescaleTimeSeries();
      const model = (options: object) => ({ ...contractSeriesModel, options });

      await store.register([model({ compressAfter: '7d', retention: '30d' })]);
      await expect(jobs()).resolves.toEqual([
        ['policy_compression', '7 days'],
        ['policy_retention', '30 days']
      ]);

      await store.register([model({ compressAfter: '7d', retention: '60d' })]);
      await expect(jobs()).resolves.toEqual([
        ['policy_compression', '7 days'],
        ['policy_retention', '60 days']
      ]);

      await store.register([model({})]);
      await expect(jobs()).resolves.toEqual([]);
    });

    test('rejects a chunk interval that is not a duration', async () => {
      const store = new TimescaleTimeSeries();

      await expect(
        store.register([
          { ...contractSeriesModel, options: { chunkInterval: 'weekly' } }
        ])
      ).rejects.toMatchObject({ code: ErrorCode.ConfigurationInvalid });
    });
  }
);

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('TimescaleTimeSeries', () => {
  beforeEach(() => {
    resetContext();
  });

  afterEach(() => {
    delete configOverrides.DATABASE_TYPE;
  });

  test('needs a PostgreSQL database', async () => {
    configOverrides.DATABASE_TYPE = DatabaseType.Sqlite;
    define({}, Database);

    await expect(
      new TimescaleTimeSeries().register([contractSeriesModel])
    ).rejects.toMatchObject({ code: ErrorCode.ConfigurationInvalid });
  });

  test('sets up nothing without series models', async () => {
    configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
    const client = { $queryRaw: jest.fn() };
    define({ client: () => client }, Database);

    await new TimescaleTimeSeries().register([]);

    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  test('creates the extension when missing, failing when it cannot', async () => {
    configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
    const client = {
      $queryRaw: jest.fn(async () => []),
      $executeRawUnsafe: jest.fn(async () => {
        throw new Error('permission denied');
      })
    };
    define({ client: () => client }, Database);

    await expect(
      new TimescaleTimeSeries().register([contractSeriesModel])
    ).rejects.toMatchObject({ code: ErrorCode.ConfigurationInvalid });
    expect(client.$executeRawUnsafe).toHaveBeenCalledWith(
      'CREATE EXTENSION IF NOT EXISTS timescaledb'
    );
  });
});
