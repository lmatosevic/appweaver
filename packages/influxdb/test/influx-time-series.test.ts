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
import {
  contractSeriesModel,
  testTimeSeriesContract
} from '@appweaver/testing';
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

    afterAll(async () => {
      // InfluxDB 3 Core holds up to 5 databases
      const database = configOverrides.TIMESERIES_INFLUXDB_DATABASE as string;
      for (const db of [database, `${database}_ContractSensorSeries`]) {
        await fetch(`${url}/api/v3/configure/database?db=${db}`, {
          method: 'DELETE'
        });
      }
      mockServer.real = false;
      delete configOverrides.TIMESERIES_INFLUXDB_HOST;
      delete configOverrides.TIMESERIES_INFLUXDB_DATABASE;
    });

    testTimeSeriesContract('InfluxTimeSeries', () => new InfluxTimeSeries());

    test('sets the retention of the database, and of the database of a model with its own', async () => {
      configOverrides.TIMESERIES_INFLUXDB_RETENTION = '30d';
      const database = configOverrides.TIMESERIES_INFLUXDB_DATABASE as string;
      const store = new InfluxTimeSeries();
      const model = {
        ...contractSeriesModel,
        options: { retention: '7d' }
      };
      // A point older than the retention is dropped by the server
      const point = { resourceId: 1, time: new Date(), values: { count: 1 } };

      try {
        await store.register([contractSeriesModel, model]);
        // Applied again on every start, updating the existing databases
        configOverrides.TIMESERIES_INFLUXDB_RETENTION = '60d';
        await store.register([contractSeriesModel, model]);
        await store.write(model, [point]);
        await expect(
          store.query(model, { resourceIds: [1] })
        ).resolves.toHaveLength(1);
        await expect(
          store.query(contractSeriesModel, { resourceIds: [1] })
        ).resolves.toHaveLength(0);

        const response = await fetch(
          `${url}/api/v3/query_sql?db=_internal&format=json&q=${encodeURIComponent(
            'SELECT database_name, retention_period_ns FROM system.databases'
          )}`
        );
        const days = Object.fromEntries(
          ((await response.json()) as any[]).map((row) => [
            row.database_name,
            row.retention_period_ns / 86_400e9
          ])
        );
        expect(days[database]).toBe(60);
        expect(days[`${database}_ContractSensorSeries`]).toBe(7);
      } finally {
        delete configOverrides.TIMESERIES_INFLUXDB_RETENTION;
        await store.onDestroy();
      }
    });
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

  describe('register', () => {
    let fetch: jest.SpyInstance;
    const own = { ...model, options: { retention: '7d' } };

    beforeEach(() => {
      fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));
    });

    afterEach(() => {
      delete configOverrides.TIMESERIES_INFLUXDB_RETENTION;
      delete configOverrides.TIMESERIES_INFLUXDB_TOKEN;
    });

    const calls = () =>
      fetch.mock.calls.map(([target, init]) => [
        init.method,
        String(target),
        JSON.parse(init.body)
      ]);

    test('leaves the databases as they are without a retention', async () => {
      await store.register([model]);

      expect(fetch).not.toHaveBeenCalled();
    });

    test('creates the database of the config and of a model with its own retention', async () => {
      configOverrides.TIMESERIES_INFLUXDB_RETENTION = '36h';

      await store.register([model, own]);

      expect(calls()).toEqual([
        [
          'POST',
          'http://localhost:8181/api/v3/configure/database',
          { db: 'appweaver', retention_period: '36h' }
        ],
        [
          'POST',
          'http://localhost:8181/api/v3/configure/database',
          { db: 'appweaver_Sensor_Series', retention_period: '7d' }
        ]
      ]);
    });

    test('updates the retention of an existing database, with the token', async () => {
      configOverrides.TIMESERIES_INFLUXDB_TOKEN = 'secret';
      fetch
        .mockResolvedValueOnce(new Response(null, { status: 409 }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      await store.register([own]);

      expect(calls().map(([method]) => method)).toEqual(['POST', 'PUT']);
      expect(fetch.mock.calls[1][1].headers.authorization).toBe(
        'Bearer secret'
      );
    });

    test('writes and queries the points of a model with its own retention in its database', async () => {
      write.mockResolvedValue(undefined);
      query
        .mockReturnValueOnce(rows({ column_name: 'temperature' }))
        .mockReturnValueOnce(rows());

      await store.write(own, [
        { resourceId: 1, time: new Date(0), values: { temperature: 1 } }
      ]);
      await store.query(own, { resourceIds: [1] });

      expect(write.mock.calls[0][1]).toBe('appweaver_Sensor_Series');
      expect(query.mock.calls.map((call) => call[1])).toEqual([
        'appweaver_Sensor_Series',
        'appweaver_Sensor_Series'
      ]);
    });

    test.each([['soon'], ['1500ms']])(
      'rejects the retention %s',
      async (retention) => {
        await expect(
          store.register([{ ...model, options: { retention } }])
        ).rejects.toMatchObject({ code: ErrorCode.ConfigurationInvalid });
      }
    );

    test('writes the retention in its largest whole unit', async () => {
      await store.register([
        { ...model, table: 'A', options: { retention: '120m' } },
        { ...model, table: 'B', options: { retention: '90s' } },
        { ...model, table: 'C', options: { retention: '61m' } }
      ]);

      expect(calls().map(([, , body]) => body.retention_period)).toEqual([
        '2h',
        '90s',
        '61m'
      ]);
    });

    test('fails on a refused database, i.e. over the limit of InfluxDB 3 Core', async () => {
      fetch.mockResolvedValue(
        new Response(
          '{"error":"Adding a new database would exceed limit of 5 databases"}',
          {
            status: 422
          }
        )
      );

      await expect(store.register([own])).rejects.toMatchObject({
        code: ErrorCode.ConfigurationInvalid,
        message: expect.stringContaining('limit of 5 databases')
      });
    });

    test('fails on a server without the configure API', async () => {
      fetch.mockResolvedValue(new Response(null, { status: 404 }));

      await expect(store.register([own])).rejects.toMatchObject({
        code: ErrorCode.ConfigurationInvalid
      });
    });

    test('fails as unavailable on another error', async () => {
      fetch.mockResolvedValueOnce(new Response('Boom', { status: 500 }));
      await expect(store.register([own])).rejects.toMatchObject({
        code: ErrorCode.TimeSeriesUnavailable
      });

      fetch.mockRejectedValueOnce(new Error('Refused'));
      await expect(store.register([own])).rejects.toMatchObject({
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
