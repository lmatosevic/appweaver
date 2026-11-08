import { DatabaseType, SeriesModel } from '@appweaver/common';
import {
  deleteStatement,
  selectStatement,
  seriesDialect,
  toDate,
  toSeriesPoints,
  upsertStatements
} from '../../../timeseries/utils/series-sql-util';

const model: SeriesModel = {
  name: 'Sensor',
  table: 'SensorSeries',
  idType: 'int',
  fields: {
    temperature: { type: 'float' },
    online: { type: 'boolean' }
  },
  options: {}
};

const time = new Date(Date.UTC(2026, 0, 1));
const point = { resourceId: 1, time, values: { temperature: 20 } };

const dialects = [
  DatabaseType.Sqlite,
  DatabaseType.PostgreSQL,
  DatabaseType.MySQL,
  DatabaseType.SQLServer
];

describe('series-sql-util', () => {
  describe('seriesDialect', () => {
    test('returns the dialect of each database, SQLite by default', () => {
      expect(seriesDialect(DatabaseType.PostgreSQL).quote('a"b')).toBe(
        '"a""b"'
      );
      expect(seriesDialect(DatabaseType.MySQL).quote('a`b')).toBe('`a``b`');
      expect(seriesDialect(DatabaseType.SQLServer).quote('a]b')).toBe('[a]]b]');
      expect(seriesDialect('other' as DatabaseType)).toBe(
        seriesDialect(DatabaseType.Sqlite)
      );
    });

    test('qualifies the PostgreSQL tables by the schema of the connection', () => {
      const dialect = seriesDialect(DatabaseType.PostgreSQL, 'shop');

      expect(dialect.table('SensorSeries')).toBe('"shop"."SensorSeries"');
      expect(seriesDialect(DatabaseType.PostgreSQL).table('SensorSeries')).toBe(
        '"SensorSeries"'
      );
      expect(upsertStatements(dialect, model, [point])[0].sql).toContain(
        'INSERT INTO "shop"."SensorSeries"'
      );
      expect(
        selectStatement(dialect, model, { resourceIds: [1] }).sql
      ).toContain('FROM "shop"."SensorSeries"');
      expect(
        deleteStatement(dialect, model, { resourceIds: [1] }).sql
      ).toContain('DELETE FROM "shop"."SensorSeries"');
    });
  });

  describe('upsertStatements', () => {
    test.each([
      [
        DatabaseType.PostgreSQL,
        'ON CONFLICT ("resourceId", "time") DO UPDATE SET "temperature" = COALESCE(excluded."temperature", "SensorSeries"."temperature")'
      ],
      [DatabaseType.Sqlite, 'ON CONFLICT ("resourceId", "time") DO UPDATE SET'],
      [
        DatabaseType.MySQL,
        'ON DUPLICATE KEY UPDATE `temperature` = COALESCE(VALUES(`temperature`), `temperature`)'
      ],
      [
        DatabaseType.SQLServer,
        'MERGE INTO [SensorSeries] WITH (HOLDLOCK) AS t USING (VALUES'
      ]
    ])('merges the points into the stored ones on %s', (type, expected) => {
      const [statement] = upsertStatements(seriesDialect(type), model, [point]);

      expect(statement.sql).toContain(expected);
      expect(statement.values).toEqual([1, time, 20, null]);
    });

    test('updates nothing of a model without fields', () => {
      const empty = { ...model, fields: {} };
      const values = (type: DatabaseType) =>
        upsertStatements(seriesDialect(type), empty, [point])[0].sql;

      expect(values(DatabaseType.PostgreSQL)).toContain('DO NOTHING');
      expect(values(DatabaseType.MySQL)).toContain('`time` = `time`');
      expect(values(DatabaseType.SQLServer)).not.toContain('WHEN MATCHED');
    });

    test('splits the points into the statements the parameters of the database allow', () => {
      const points = Array.from({ length: 1001 }, (_, i) => ({
        ...point,
        time: new Date(i)
      }));

      expect(
        upsertStatements(seriesDialect(DatabaseType.SQLServer), model, points)
      ).toHaveLength(3);
      expect(
        upsertStatements(seriesDialect(DatabaseType.PostgreSQL), model, points)
      ).toHaveLength(1);
    });
  });

  describe('selectStatement', () => {
    test.each(dialects)(
      'selects the stored points of a range on %s',
      (type) => {
        const statement = selectStatement(seriesDialect(type), model, {
          resourceIds: [1, 2],
          fields: ['temperature'],
          from: time,
          to: time,
          order: 'desc',
          limit: 10
        });

        expect(statement.values).toEqual([1, 2, time, time]);
        expect(statement.sql).toContain(
          type === DatabaseType.SQLServer
            ? 'FETCH NEXT 10 ROWS ONLY'
            : 'LIMIT 10'
        );
        expect(statement.sql).toContain('DESC');
      }
    );

    test.each([
      [
        DatabaseType.PostgreSQL,
        `date_bin(INTERVAL '3600 seconds', "time", TIMESTAMP '1970-01-01 00:00:00')`,
        'AVG(CAST("online" AS INTEGER))'
      ],
      [
        DatabaseType.Sqlite,
        `% 3600) + 3600) % 3600), 'unixepoch')`,
        'AVG("online")'
      ],
      [
        DatabaseType.MySQL,
        'TIMESTAMPADD(SECOND, FLOOR(TIMESTAMPDIFF(SECOND',
        'AVG(CAST(`online` AS SIGNED))'
      ],
      [
        DatabaseType.SQLServer,
        'DATEADD(SECOND, CAST(',
        'AVG(CAST(CAST([online] AS INT) AS FLOAT))'
      ]
    ])('aggregates by bucket on %s', (type, bucket, average) => {
      const statement = selectStatement(seriesDialect(type), model, {
        resourceIds: [1],
        bucket: 3600,
        aggregate: 'avg'
      });

      expect(statement.sql).toContain(bucket);
      expect(statement.sql).toContain(average);
      expect(statement.sql).toContain('GROUP BY');
    });

    test('sums the integers of SQL Server as big integers, past the range of its INT', () => {
      const sumOf = (type: DatabaseType) =>
        selectStatement(
          seriesDialect(type),
          {
            ...model,
            fields: { ...model.fields, count: { type: 'int' } }
          },
          { resourceIds: [1], aggregate: 'sum' }
        ).sql;

      const sqlServer = sumOf(DatabaseType.SQLServer);
      expect(sqlServer).toContain('SUM(CAST([count] AS BIGINT))');
      expect(sqlServer).toContain('SUM([temperature])');
      expect(sqlServer).toContain('SUM(CAST([online] AS INT))');
      expect(sumOf(DatabaseType.PostgreSQL)).toContain('SUM("count")');
    });

    test('aggregates the whole range without a bucket, the count of a field and the first value', () => {
      const dialect = seriesDialect(DatabaseType.PostgreSQL);

      const count = selectStatement(dialect, model, {
        resourceIds: [1],
        aggregate: 'count'
      });
      const first = selectStatement(dialect, model, {
        resourceIds: [1],
        aggregate: 'first'
      });

      expect(count.sql).toContain('MIN("time") AS "t"');
      expect(count.sql).toContain('COUNT("temperature")');
      expect(first.sql).toContain('ORDER BY "time" ASC');
      expect(first.sql).toContain('0 AS "b"');
      expect(first.sql).toContain('"k"."mt"');
    });

    test('takes the last value of each bucket with a bucket function of its own', () => {
      const statement = selectStatement(
        seriesDialect(DatabaseType.PostgreSQL),
        model,
        { resourceIds: [1], bucket: 60, aggregate: 'last' },
        (column, width) => `my_bucket(${width}, ${column})`
      );

      expect(statement.sql).toContain('my_bucket(60, "time") AS "b"');
      expect(statement.sql).toContain('ORDER BY "time" DESC');
    });
  });

  describe('deleteStatement', () => {
    test('deletes the points of the resources within a range', () => {
      const statement = deleteStatement(
        seriesDialect(DatabaseType.MySQL),
        model,
        {
          resourceIds: [1],
          from: time
        }
      );

      expect(statement.sql).toBe(
        'DELETE FROM `SensorSeries` WHERE `resourceId` IN (?) AND `time` >= ?'
      );
      expect(statement.values).toEqual([1, time]);
    });
  });

  describe('toSeriesPoints', () => {
    test('converts the values of the databases to the types of the fields', () => {
      const rows = [
        {
          rid: '7',
          t: '2026-01-01 00:00:00.000',
          temperature: { toNumber: () => 1.5 },
          online: 1
        },
        { rid: 8n, t: time, temperature: '2.5', online: false },
        {
          rid: 9,
          t: '2026-01-01T00:00:00.000+00:00',
          temperature: 3n,
          online: null
        }
      ];

      expect(toSeriesPoints(model, { resourceIds: [7, 8, 9] }, rows)).toEqual([
        { resourceId: 7, time, values: { temperature: 1.5, online: true } },
        { resourceId: 8, time, values: { temperature: 2.5, online: false } },
        { resourceId: 9, time, values: { temperature: 3, online: null } }
      ]);
    });

    test('keeps the aggregated booleans as numbers, and the string ids', () => {
      const points = toSeriesPoints(
        { ...model, idType: 'string' },
        { resourceIds: ['a'], aggregate: 'avg', fields: ['online'] },
        [{ rid: 'a', t: time, online: '0.5' }]
      );

      expect(points).toEqual([
        { resourceId: 'a', time, values: { online: 0.5 } }
      ]);
    });
  });

  describe('toDate', () => {
    test('reads a time of a database in UTC', () => {
      expect(toDate('2026-01-01 00:00:00')).toEqual(time);
      expect(toDate(time.getTime())).toEqual(time);
    });
  });
});
