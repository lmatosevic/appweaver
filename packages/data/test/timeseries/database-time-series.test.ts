import fs from 'node:fs';
import path from 'node:path';
import {
  configOverrides,
  createLogger,
  Database,
  DatabaseType,
  ErrorCode
} from '@appweaver/common';
import { define } from '@appweaver/core';
import { contractSeriesModel } from '@appweaver/testing';
import { DatabaseTimeSeries } from '../../timeseries/database-time-series';
import { dir, testDatabaseContract } from './support/database-contract';

testDatabaseContract(
  'DatabaseTimeSeries',
  DatabaseType.Sqlite,
  `file:${path.join(dir, 'series.db')}`,
  undefined,
  () => {
    test('deletes the points older than the retention of their model', async () => {
      configOverrides.TIMESERIES_DATABASE_RETENTION_INTERVAL = '';
      const store = new DatabaseTimeSeries();
      const model = { ...contractSeriesModel, options: { retention: '1d' } };
      // Before the points of the contract suite, which share the table
      const now = new Date(Date.UTC(2025, 0, 1));
      const day = 86_400_000;
      await store.write(model, [
        {
          resourceId: 900,
          time: new Date(now.getTime() - 3 * day),
          values: { count: 1 }
        },
        {
          resourceId: 901,
          time: new Date(now.getTime() - 2 * day),
          values: { count: 2 }
        },
        {
          resourceId: 900,
          time: new Date(now.getTime() - day / 2),
          values: { count: 3 }
        }
      ]);

      await store.register([model]);

      await expect(store.purge(now)).resolves.toBe(2);
      const points = await store.query(model, { resourceIds: [900, 901] });
      expect(points.map((point) => point.values.count)).toEqual([3]);
      delete configOverrides.TIMESERIES_DATABASE_RETENTION_INTERVAL;
    });
  }
);
testDatabaseContract(
  'DatabaseTimeSeries',
  DatabaseType.PostgreSQL,
  process.env.TIMESERIES_TEST_POSTGRES_URL
);
testDatabaseContract(
  'DatabaseTimeSeries',
  DatabaseType.MySQL,
  process.env.TIMESERIES_TEST_MYSQL_URL
);
testDatabaseContract(
  'DatabaseTimeSeries',
  DatabaseType.SQLServer,
  process.env.TIMESERIES_TEST_SQLSERVER_URL
);

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('DatabaseTimeSeries', () => {
  test('deletes the points with their resource, by the foreign key', () => {
    configOverrides.DATABASE_TYPE = DatabaseType.Sqlite;
    define({}, Database);

    const store = new DatabaseTimeSeries();

    expect(store.cascadesDeletes).toBe(true);
    expect(store.supportsDelete).toBe(true);
    delete configOverrides.DATABASE_TYPE;
  });

  test('writes nothing for no points', async () => {
    const client = { $executeRaw: jest.fn() };
    define({ client: () => client }, Database, 'override');

    await expect(
      new DatabaseTimeSeries().write(contractSeriesModel, [])
    ).resolves.toBe(0);
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  test('writes the statements of many points in a transaction', async () => {
    configOverrides.DATABASE_TYPE = DatabaseType.SQLServer;
    const tx = { $executeRaw: jest.fn() };
    define(
      { client: () => ({}), transaction: async (fn: any) => fn(tx) },
      Database,
      'override'
    );
    const points = Array.from({ length: 1000 }, (_, i) => ({
      resourceId: 1,
      time: new Date(i),
      values: { count: i }
    }));

    await expect(
      new DatabaseTimeSeries().write(contractSeriesModel, points)
    ).resolves.toBe(1000);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    delete configOverrides.DATABASE_TYPE;
  });

  test('passes on the errors of the database', async () => {
    const error = new Error('Down');
    define(
      {
        client: () => ({
          $queryRaw: jest.fn().mockRejectedValue(error),
          $executeRaw: jest.fn().mockRejectedValue(error)
        })
      },
      Database,
      'override'
    );
    const store = new DatabaseTimeSeries();
    const point = { resourceId: 1, time: new Date(0), values: { count: 1 } };

    await expect(store.write(contractSeriesModel, [point])).rejects.toBe(error);
    await expect(
      store.query(contractSeriesModel, { resourceIds: [1] })
    ).rejects.toBe(error);
    await expect(
      store.delete(contractSeriesModel, { resourceIds: [1] })
    ).rejects.toBe(error);
  });

  describe('retention', () => {
    let client: { $executeRaw: jest.Mock };

    beforeEach(() => {
      jest.useFakeTimers();
      client = { $executeRaw: jest.fn(async () => 1) };
      define({ client: () => client }, Database, 'override');
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
      delete configOverrides.TIMESERIES_DATABASE_RETENTION;
      delete configOverrides.TIMESERIES_DATABASE_RETENTION_INTERVAL;
    });

    const model = (retention?: string) => ({
      ...contractSeriesModel,
      options: retention ? { retention } : {}
    });

    test('deletes the expired points at once and every interval, until destroyed', async () => {
      configOverrides.TIMESERIES_DATABASE_RETENTION_INTERVAL = '10m';
      const store = new DatabaseTimeSeries();

      await store.register([model('30d'), model()]);
      expect(client.$executeRaw).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(client.$executeRaw).toHaveBeenCalledTimes(2);
      const [statement] = client.$executeRaw.mock.calls[1] as any[];
      expect(statement.sql).toContain('DELETE FROM');
      expect(statement.values[0].getTime()).toBe(Date.now() - 30 * 86_400_000);

      await store.onDestroy();
      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(client.$executeRaw).toHaveBeenCalledTimes(2);
    });

    test('takes the retention of the config for a model without its own', async () => {
      configOverrides.TIMESERIES_DATABASE_RETENTION = '7d';
      const store = new DatabaseTimeSeries();

      await store.register([model()]);

      await expect(store.purge()).resolves.toBe(1);
      await store.onDestroy();
    });

    test('deletes nothing without a retention or an interval', async () => {
      const store = new DatabaseTimeSeries();
      await store.register([model()]);

      configOverrides.TIMESERIES_DATABASE_RETENTION_INTERVAL = '';
      const manual = new DatabaseTimeSeries();
      await manual.register([model('1d')]);
      await jest.advanceTimersByTimeAsync(2 * 3_600_000);

      expect(client.$executeRaw).not.toHaveBeenCalled();
      await expect(manual.purge()).resolves.toBe(1);
    });

    test.each([
      [{ retention: 'soon' }, {}],
      [{ retention: '1d' }, { TIMESERIES_DATABASE_RETENTION_INTERVAL: '500ms' }]
    ])('rejects the durations %j %j', async (options, overrides) => {
      Object.assign(configOverrides, overrides);

      await expect(
        new DatabaseTimeSeries().register([{ ...contractSeriesModel, options }])
      ).rejects.toMatchObject({ code: ErrorCode.ConfigurationInvalid });
    });

    test('logs a failed delete of the interval, and passes it on from a purge', async () => {
      const error = jest
        .spyOn(createLogger('timeseries'), 'error')
        .mockImplementation();
      client.$executeRaw.mockRejectedValue(new Error('Down'));
      const store = new DatabaseTimeSeries();

      await store.register([model('1d')]);
      await jest.advanceTimersByTimeAsync(0);

      expect(error).toHaveBeenCalledTimes(1);
      await expect(store.purge()).rejects.toThrow('Down');
      await store.onDestroy();
    });
  });
});
