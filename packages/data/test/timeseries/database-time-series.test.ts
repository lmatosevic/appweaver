import fs from 'node:fs';
import path from 'node:path';
import { configOverrides, Database, DatabaseType } from '@appweaver/common';
import { define } from '@appweaver/core';
import { contractSeriesModel } from '@appweaver/testing';
import { DatabaseTimeSeries } from '../../timeseries/database-time-series';
import { dir, testDatabaseContract } from './support/database-contract';

testDatabaseContract(
  'DatabaseTimeSeries',
  DatabaseType.Sqlite,
  `file:${path.join(dir, 'series.db')}`
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
});
