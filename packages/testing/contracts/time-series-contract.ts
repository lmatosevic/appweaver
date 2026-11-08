import { SeriesModel, SeriesPoint, TimeSeries } from '@appweaver/common';
import { ContractFactory, runner } from './contract-util';

/** The series model the time series suite writes, its table to be created by a store needing one. */
export const contractSeriesModel: SeriesModel = {
  name: 'ContractSensor',
  table: 'ContractSensorSeries',
  idType: 'int',
  fields: {
    temperature: { type: 'float' },
    count: { type: 'int' },
    online: { type: 'boolean' }
  },
  options: {}
};

export type TimeSeriesContractOptions = {
  /** The series model to write (default: {@link contractSeriesModel}) */
  model?: SeriesModel;
};

const BASE = Date.UTC(2026, 0, 1);
const MINUTE = 60_000;

const at = (minutes: number) => new Date(BASE + minutes * MINUTE);

/**
 * Tests a `TimeSeries` driver against the behavior every driver shares, with the `describe` and `test` globals of
 * Jest, Vitest or Bun. Each test gets a fresh, initialized and registered instance, and writes the points of its own
 * resources, so the points a persistent store keeps between the tests never meet.
 *
 * @param {string} name - The name of the driver, i.e. `QuestTimeSeries`.
 * @param {ContractFactory<TimeSeries>} create - Creates the driver.
 * @param {TimeSeriesContractOptions} [options] - The series model to write.
 */
export function testTimeSeriesContract(
  name: string,
  create: ContractFactory<TimeSeries>,
  options: TimeSeriesContractOptions = {}
): void {
  const { describe, test, expect, beforeEach, afterEach } = runner();
  const model = options.model ?? contractSeriesModel;
  let nextId = Math.floor(Math.random() * 1_000_000) * 10;

  describe(`${name} implements the TimeSeries contract`, () => {
    let store: TimeSeries;
    let ids: number[];

    beforeEach(async () => {
      store = await create();
      await store.onInit();
      await store.register([model]);
      ids = [++nextId, ++nextId, ++nextId];
    });

    afterEach(async () => {
      await store.onDestroy();
    });

    const write = (points: SeriesPoint[]) => store.write(model, points);

    test('writes points and queries them back in time order', async () => {
      await expect(
        write([
          { resourceId: ids[0], time: at(2), values: { temperature: 21.5 } },
          {
            resourceId: ids[0],
            time: at(1),
            values: { temperature: 20, count: 3, online: true }
          }
        ])
      ).resolves.toBe(2);

      const points = await store.query(model, { resourceIds: [ids[0]] });

      expect(points).toEqual([
        {
          resourceId: ids[0],
          time: at(1),
          values: { temperature: 20, count: 3, online: true }
        },
        {
          resourceId: ids[0],
          time: at(2),
          values: { temperature: 21.5, count: null, online: null }
        }
      ]);
    });

    test('merges a point into the one stored at the same time', async () => {
      await write([
        {
          resourceId: ids[0],
          time: at(1),
          values: { temperature: 20, count: 1 }
        }
      ]);
      await write([
        { resourceId: ids[0], time: at(1), values: { count: 2, online: false } }
      ]);

      const points = await store.query(model, { resourceIds: [ids[0]] });

      expect(points).toEqual([
        {
          resourceId: ids[0],
          time: at(1),
          values: { temperature: 20, count: 2, online: false }
        }
      ]);
    });

    test('selects the fields and the time range, skipping the points without them', async () => {
      await write([
        { resourceId: ids[0], time: at(0), values: { temperature: 1 } },
        { resourceId: ids[0], time: at(1), values: { count: 1 } },
        { resourceId: ids[0], time: at(2), values: { temperature: 2 } },
        { resourceId: ids[0], time: at(3), values: { temperature: 3 } }
      ]);

      const points = await store.query(model, {
        resourceIds: [ids[0]],
        fields: ['temperature'],
        from: at(0),
        to: at(3)
      });

      expect(points.map((point) => point.values)).toEqual([
        { temperature: 1 },
        { temperature: 2 }
      ]);
    });

    test('orders the points of several resources and limits them', async () => {
      await write([
        { resourceId: ids[1], time: at(1), values: { count: 10 } },
        { resourceId: ids[0], time: at(1), values: { count: 1 } },
        { resourceId: ids[0], time: at(2), values: { count: 2 } },
        { resourceId: ids[2], time: at(3), values: { count: 30 } }
      ]);

      const ascending = await store.query(model, {
        resourceIds: [ids[0], ids[1]],
        fields: ['count']
      });
      const descending = await store.query(model, {
        resourceIds: ids,
        fields: ['count'],
        order: 'desc',
        limit: 2
      });

      expect(
        ascending.map((point) => [point.resourceId, point.values.count])
      ).toEqual([
        [ids[0], 1],
        [ids[1], 10],
        [ids[0], 2]
      ]);
      expect(descending.map((point) => point.values.count)).toEqual([30, 2]);
    });

    test('aggregates the points of each bucket, aligned to the epoch', async () => {
      await write([
        {
          resourceId: ids[0],
          time: at(0),
          values: { temperature: 10, count: 1, online: true }
        },
        {
          resourceId: ids[0],
          time: at(5),
          values: { temperature: 20, count: 2, online: false }
        },
        { resourceId: ids[0], time: at(9), values: { temperature: 30 } },
        {
          resourceId: ids[0],
          time: at(12),
          values: { temperature: 40, count: 4, online: true }
        }
      ]);

      const query = (aggregate: any) =>
        store.query(model, { resourceIds: [ids[0]], bucket: 600, aggregate });

      const avg = await query('avg');
      expect(avg.map((point) => point.time)).toEqual([at(0), at(10)]);
      expect(avg.map((point) => point.values)).toEqual([
        { temperature: 20, count: 1.5, online: 0.5 },
        { temperature: 40, count: 4, online: 1 }
      ]);

      const [min] = await query('min');
      const [max] = await query('max');
      const [sum] = await query('sum');
      const [count] = await query('count');
      const [first] = await query('first');
      const [last] = await query('last');

      expect(min.values).toEqual({ temperature: 10, count: 1, online: 0 });
      expect(max.values).toEqual({ temperature: 30, count: 2, online: 1 });
      expect(sum.values).toEqual({ temperature: 60, count: 3, online: 1 });
      expect(count.values).toEqual({ temperature: 3, count: 2, online: 2 });
      expect(first.values).toEqual({ temperature: 10, count: 1, online: true });
      expect(last.values).toEqual({ temperature: 30, count: 2, online: false });
    });

    test('aggregates the whole range of each resource without a bucket', async () => {
      await write([
        { resourceId: ids[0], time: at(3), values: { count: 1 } },
        { resourceId: ids[0], time: at(4), values: { count: 3 } },
        { resourceId: ids[1], time: at(5), values: { count: 7 } }
      ]);

      const points = await store.query(model, {
        resourceIds: [ids[0], ids[1]],
        fields: ['count'],
        aggregate: 'max'
      });

      expect(points).toEqual([
        { resourceId: ids[0], time: at(3), values: { count: 3 } },
        { resourceId: ids[1], time: at(5), values: { count: 7 } }
      ]);
    });

    test('sums an integer field past 32 bits', async () => {
      await write([
        { resourceId: ids[0], time: at(1), values: { count: 2_000_000_000 } },
        { resourceId: ids[0], time: at(2), values: { count: 2_000_000_000 } },
        { resourceId: ids[0], time: at(3), values: { count: 2_000_000_000 } }
      ]);

      const points = await store.query(model, {
        resourceIds: [ids[0]],
        fields: ['count'],
        aggregate: 'sum'
      });

      expect(points.map((point) => point.values.count)).toEqual([
        6_000_000_000
      ]);
    });

    test('rounds a bucket down before the epoch', async () => {
      const time = new Date(Date.UTC(1969, 11, 31, 23, 30));
      await write([{ resourceId: ids[0], time, values: { count: 1 } }]);

      const points = await store.query(model, {
        resourceIds: [ids[0]],
        fields: ['count'],
        bucket: 3600,
        aggregate: 'sum'
      });

      expect(points.map((point) => point.time)).toEqual([
        new Date(Date.UTC(1969, 11, 31, 23))
      ]);
      // A store sharing its table with a retention test keeps no old point
      if (store.supportsDelete) {
        await store.delete(model, { resourceIds: [ids[0]] });
      }
    });

    test('deletes the points of a time range', async () => {
      if (!store.supportsDelete) {
        return;
      }

      await write([
        { resourceId: ids[0], time: at(1), values: { count: 1 } },
        { resourceId: ids[0], time: at(2), values: { count: 2 } },
        { resourceId: ids[0], time: at(3), values: { count: 3 } },
        { resourceId: ids[1], time: at(2), values: { count: 20 } }
      ]);

      await expect(
        store.delete(model, { resourceIds: [ids[0]], from: at(2), to: at(3) })
      ).resolves.toBe(1);
      const remaining = await store.query(model, {
        resourceIds: [ids[0], ids[1]]
      });
      expect(remaining.map((point) => point.values.count)).toEqual([1, 20, 3]);

      await expect(
        store.delete(model, { resourceIds: [ids[0]] })
      ).resolves.toBe(2);
      const others = await store.query(model, {
        resourceIds: [ids[0], ids[1]]
      });
      expect(others.map((point) => point.values.count)).toEqual([20]);
    });

    test('reports its health', async () => {
      await expect(store.checkHealth()).resolves.toMatchObject({
        success: true
      });
    });
  });
}
