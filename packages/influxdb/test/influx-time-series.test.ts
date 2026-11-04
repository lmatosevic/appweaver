const write = jest.fn();
const query = jest.fn();
const close = jest.fn();
const getServerVersion = jest.fn();
const options = jest.fn();
const mockServer = { real: false };

// The client of the server the contract suite runs on, otherwise a stub
jest.mock('@influxdata/influxdb3-client', () => {
  const actual = jest.requireActual('@influxdata/influxdb3-client');
  return {
    InfluxDBClient: jest.fn().mockImplementation((config) => {
      if (mockServer.real) {
        return new actual.InfluxDBClient(config);
      }
      options(config);
      return { write, query, close, getServerVersion };
    })
  };
});

import {
  configOverrides,
  createLogger,
  ErrorCode,
  SeriesModel
} from '@appweaver/common';
import { testTimeSeriesContract } from '@appweaver/testing';
import { InfluxTimeSeries, selectStatement } from '../influx-time-series';

// Runs on an InfluxDB 3 server when its URL is set, i.e. one of `influxdb3 serve --without-auth`
const url = process.env.TIMESERIES_TEST_INFLUXDB_URL;

if (url) {
  describe('InfluxTimeSeries on InfluxDB', () => {
    beforeAll(() => {
      mockServer.real = true;
      configOverrides.TIMESERIES_INFLUXDB_HOST = url;
      configOverrides.TIMESERIES_INFLUXDB_DATABASE = `contract_${Date.now()}`;
    });

    afterAll(() => {
      mockServer.real = false;
      delete configOverrides.TIMESERIES_INFLUXDB_HOST;
      delete configOverrides.TIMESERIES_INFLUXDB_DATABASE;
    });

    testTimeSeriesContract('InfluxTimeSeries', () => new InfluxTimeSeries());
  });
}

const model: SeriesModel = {
  name: 'Sensor',
  table: 'Sensor Series',
  idType: 'int',
  fields: {
    temperature: { type: 'float' },
    errors: { type: 'int' },
    online: { type: 'boolean' }
  },
  options: {}
};

async function* rows(...items: Record<string, unknown>[]) {
  yield* items;
}

describe('influx-time-series', () => {
  let store: InfluxTimeSeries;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(createLogger('timeseries'), 'error').mockImplementation();
    store = new InfluxTimeSeries();
    await store.onInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('connects with a placeholder token to a server without authentication', () => {
    expect(options).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'http://localhost:8181',
        token: 'none',
        database: 'appweaver'
      })
    );
  });

  describe('write', () => {
    test('writes the points as line protocol in milliseconds', async () => {
      await expect(
        store.write(model, [
          {
            resourceId: 'a b,c',
            time: new Date(1000),
            values: { temperature: 20, errors: 2.0, online: false }
          },
          {
            resourceId: 1,
            time: new Date(2000),
            values: { temperature: null }
          },
          { resourceId: 1, time: new Date(3000), values: { online: true } }
        ])
      ).resolves.toBe(3);

      expect(write).toHaveBeenCalledWith(
        'Sensor\\ Series,resourceId=a\\ b\\,c temperature=20,errors=2i,online=false 1000\n' +
          'Sensor\\ Series,resourceId=1 online=true 3000',
        'appweaver',
        undefined,
        { precision: 'ms' }
      );
    });

    test('writes nothing for points without values', async () => {
      await expect(
        store.write(model, [{ resourceId: 1, time: new Date(0), values: {} }])
      ).resolves.toBe(0);
      expect(write).not.toHaveBeenCalled();
    });

    test('fails as unavailable when the server rejects the write', async () => {
      write.mockRejectedValue(new Error('Down'));

      await expect(
        store.write(model, [
          { resourceId: 1, time: new Date(0), values: { errors: 1 } }
        ])
      ).rejects.toMatchObject({ code: ErrorCode.TimeSeriesUnavailable });
    });
  });

  describe('query', () => {
    test('returns no points before the first write', async () => {
      query.mockImplementation(() => {
        throw new Error('database not found');
      });

      await expect(store.query(model, { resourceIds: [1] })).resolves.toEqual(
        []
      );
    });

    test('returns no points for a table without columns', async () => {
      query.mockReturnValue(rows());

      await expect(store.query(model, { resourceIds: [1] })).resolves.toEqual(
        []
      );
    });

    test('converts the rows, the fields without a column being null', async () => {
      query
        .mockReturnValueOnce(
          rows({ column_name: 'temperature' }, { column_name: 'online' })
        )
        .mockReturnValueOnce(
          rows({
            rid: '1',
            t: 2_000_000_000n,
            temperature: 21.5,
            errors: null,
            online: true
          })
        );

      const points = await store.query(model, { resourceIds: [1] });

      expect(points).toEqual([
        {
          resourceId: 1,
          time: new Date(2000),
          values: { temperature: 21.5, errors: null, online: true }
        }
      ]);
      expect(query.mock.calls[1][0]).toContain('NULL AS "errors"');
      expect(query.mock.calls[1][2]).toEqual({
        type: 'sql',
        params: { r0: '1' }
      });
    });

    test('fails as unavailable when the query fails', async () => {
      query
        .mockReturnValueOnce(rows({ column_name: 'temperature' }))
        .mockImplementationOnce(() => {
          throw new Error('Down');
        });

      await expect(
        store.query(model, { resourceIds: [1] })
      ).rejects.toMatchObject({
        code: ErrorCode.TimeSeriesUnavailable
      });

      query.mockImplementationOnce(() => {
        throw new Error('Down');
      });
      await expect(
        store.query(model, { resourceIds: [1] })
      ).rejects.toMatchObject({
        code: ErrorCode.TimeSeriesUnavailable
      });
    });
  });

  describe('selectStatement', () => {
    const columns = new Set(['temperature', 'errors', 'online']);

    test('selects the stored points of a range', () => {
      const sql = selectStatement(
        model,
        {
          resourceIds: [1, 2],
          from: new Date(0),
          to: new Date(1000),
          order: 'desc',
          limit: 5
        },
        ['temperature'],
        columns
      );

      expect(sql).toBe(
        'SELECT "resourceId" AS rid, time AS t, "temperature" FROM "Sensor Series" ' +
          `WHERE "resourceId" IN ($r0, $r1) AND time >= TIMESTAMP '1970-01-01T00:00:00.000Z' ` +
          `AND time < TIMESTAMP '1970-01-01T00:00:01.000Z' AND ("temperature" IS NOT NULL) ` +
          'ORDER BY t DESC, rid ASC LIMIT 5'
      );
    });

    test('aggregates by bucket, the booleans as numbers', () => {
      const sql = selectStatement(
        model,
        { resourceIds: [1], bucket: 3600, aggregate: 'avg' },
        ['online', 'temperature'],
        new Set(['online'])
      );

      expect(sql).toContain(
        `date_bin(INTERVAL '3600 seconds', time, TIMESTAMP '1970-01-01T00:00:00Z') AS t`
      );
      expect(sql).toContain('AVG(CAST("online" AS DOUBLE)) AS "online"');
      expect(sql).toContain('NULL AS "temperature"');
      expect(sql).toContain('GROUP BY "resourceId", date_bin(');
    });

    test.each([
      ['count', 'COUNT("errors")', '0 AS "temperature"'],
      [
        'first',
        'first_value("errors" ORDER BY time ASC) FILTER (WHERE "errors" IS NOT NULL)',
        'NULL'
      ],
      [
        'last',
        'last_value("errors" ORDER BY time ASC) FILTER (WHERE "errors" IS NOT NULL)',
        'NULL'
      ]
    ])(
      'aggregates the whole range with %s',
      (aggregate, expression, missing) => {
        const sql = selectStatement(
          model,
          { resourceIds: [1], aggregate: aggregate as any },
          ['errors', 'temperature'],
          new Set(['errors'])
        );

        expect(sql).toContain('MIN(time) AS t');
        expect(sql).toContain(expression);
        expect(sql).toContain(missing);
      }
    );

    test('selects nothing without a stored field', () => {
      expect(
        selectStatement(model, { resourceIds: [1] }, ['errors'], new Set())
      ).toContain('AND FALSE');
    });
  });

  test('deletes no points', async () => {
    expect(store.supportsDelete).toBe(false);
    await expect(
      store.delete(model, { resourceIds: [1] })
    ).rejects.toMatchObject({
      code: ErrorCode.TimeSeriesUnsupported
    });
  });

  test('reports its health from the server version', async () => {
    getServerVersion
      .mockResolvedValueOnce('3.0')
      .mockRejectedValueOnce(new Error('Down'));

    await expect(store.checkHealth()).resolves.toEqual({ success: true });
    await expect(store.checkHealth()).resolves.toEqual({
      success: false,
      message: 'Down'
    });
  });

  test('closes the client on destroy', async () => {
    await store.register([model]);
    await store.onDestroy();
    await store.onDestroy();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
