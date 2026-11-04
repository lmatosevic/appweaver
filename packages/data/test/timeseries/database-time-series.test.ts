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
});
