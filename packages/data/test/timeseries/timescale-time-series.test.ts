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

  describe('with a stubbed database', () => {
    const queries: string[] = [];
    let compressionEnabled: boolean;
    let job: { same: boolean } | undefined;
    const transaction = jest.fn();

    beforeEach(() => {
      configOverrides.DATABASE_TYPE = DatabaseType.PostgreSQL;
      queries.length = 0;
      compressionEnabled = false;
      job = undefined;
      const tx = {
        $executeRawUnsafe: jest.fn(async (sql: string) => queries.push(sql)),
        $queryRaw: jest.fn(async (sql: any) =>
          sql.sql.includes('compression_enabled')
            ? [{ compression_enabled: compressionEnabled }]
            : job
              ? [job]
              : []
        )
      };
      define(
        {
          client: () => ({
            $queryRaw: jest.fn(async () => [{ extversion: '2.31.0' }])
          }),
          transaction: transaction.mockImplementation(
            async (fn: (tx: unknown) => unknown) => fn(tx)
          )
        },
        Database
      );
    });

    const register = (options: object) =>
      new TimescaleTimeSeries().register([{ ...contractSeriesModel, options }]);

    test('creates the hypertable under a lock, without the default indexes', async () => {
      await register({ chunkInterval: '1d' });

      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 60000
      });
      expect(queries[0]).toContain('pg_advisory_xact_lock');
      expect(queries[1]).toBe(
        `SELECT create_hypertable('"ContractSensorSeries"', by_range('time', INTERVAL '1 days'), ` +
          'if_not_exists => TRUE, create_default_indexes => FALSE, migrate_data => TRUE)'
      );
      expect(queries[2]).toContain(
        `set_chunk_time_interval('"ContractSensorSeries"', INTERVAL '1 days')`
      );
      expect(queries).toHaveLength(3);
    });

    test('enables the compression once, and adds its policy', async () => {
      await register({ compressAfter: '90m' });
      compressionEnabled = true;
      await register({ compressAfter: '2h' });

      expect(
        queries.filter((sql) => sql.startsWith('ALTER TABLE'))
      ).toHaveLength(1);
      expect(queries).toContain(
        `SELECT add_compression_policy('"ContractSensorSeries"', INTERVAL '90 minutes')`
      );
      expect(queries).toContain(
        `SELECT add_compression_policy('"ContractSensorSeries"', INTERVAL '2 hours')`
      );
    });

    test('keeps a policy in line, replacing a changed one', async () => {
      job = { same: true };
      await register({ retention: '30d' });
      expect(queries.some((sql) => sql.includes('retention_policy'))).toBe(
        false
      );

      job = { same: false };
      await register({ retention: '45s' });
      expect(queries).toContain(
        `SELECT remove_retention_policy('"ContractSensorSeries"', if_exists => TRUE)`
      );
      expect(queries).toContain(
        `SELECT add_retention_policy('"ContractSensorSeries"', INTERVAL '45 seconds')`
      );
    });

    test('aggregates with time_bucket', () => {
      const store = new TimescaleTimeSeries() as any;

      expect(store.bucket('"time"', 60)).toBe(
        `time_bucket(INTERVAL '60 seconds', "time", TIMESTAMP '1970-01-01 00:00:00')`
      );
    });
  });
});
