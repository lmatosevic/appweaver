import {
  ConfigurationError,
  configOverrides,
  createLogger,
  DatabaseError,
  ErrorCode,
  Queue,
  ResourceModel,
  TimeSeries
} from '@appweaver/common';
import { context } from '../../context/context';
import { define } from '../../context/dependency-injection';
import {
  runInTransaction,
  settleTransaction,
  TransactionContext
} from '../../context/transaction-scope';
import { MemoryQueue } from '../../queue/memory-queue';
import { MemoryTimeSeries } from '../../timeseries/memory-time-series';
import { TimeSeriesService } from '../../timeseries/time-series-service';
import { resetContext } from '../fixtures/context-fixture';

const logger = createLogger('timeseries');

const sensor = {
  name: 'Sensor',
  config: {
    name: 'Sensor',
    series: {
      temperature: { type: 'float', minimum: -50, maximum: 150 },
      errors: { type: 'int' },
      online: { type: 'boolean' }
    }
  }
} as unknown as ResourceModel;

const device = {
  name: 'Device',
  config: {
    name: 'Device',
    id: { type: 'string' },
    tableName: 'devices',
    series: { load: { type: 'float' } },
    seriesOptions: { ingest: 'queue' }
  }
} as unknown as ResourceModel;

const plain = {
  name: 'Plain',
  config: { name: 'Plain' }
} as unknown as ResourceModel;

const at = (minutes: number) =>
  new Date(Date.UTC(2026, 0, 1) + minutes * 60_000);

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out');
}

describe('time-series-service', () => {
  let store: MemoryTimeSeries;
  let service: TimeSeriesService;

  beforeEach(() => {
    resetContext();
    context.resource.models.set('Sensor', sensor);
    context.resource.models.set('Device', device);
    context.resource.models.set('Plain', plain);
    store = new MemoryTimeSeries();
    define(store, TimeSeries);
    service = new TimeSeriesService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(configOverrides)) {
      if (key.startsWith('TIMESERIES_')) {
        delete configOverrides[key];
      }
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('models', () => {
    test('returns the series of the models declaring series fields', () => {
      expect(
        service.models().map((model) => [model.name, model.table, model.idType])
      ).toEqual([
        ['Sensor', 'SensorSeries', 'int'],
        ['Device', 'devices_series', 'string']
      ]);
    });

    test('fails for a model without series', () => {
      expect(() => service.model('Plain')).toThrow(
        expect.objectContaining({ code: ErrorCode.TimeSeriesNotEnabled })
      );
      expect(() => service.model('Missing')).toThrow(
        expect.objectContaining({ code: ErrorCode.TimeSeriesNotEnabled })
      );
    });
  });

  describe('write', () => {
    test('writes the points directly, merging the ones of a resource at the same time', async () => {
      const result = await service.write('Sensor', [
        {
          resourceId: '1',
          time: at(0).toISOString(),
          values: { temperature: 20 }
        },
        {
          resourceId: 1,
          time: at(0).getTime(),
          values: { errors: 2, online: null }
        },
        { resourceId: 1, time: at(1), values: { online: true } }
      ]);

      expect(result).toEqual({ count: 2, queued: false });
      await expect(
        service.query('Sensor', { resourceIds: [1] })
      ).resolves.toEqual([
        {
          resourceId: 1,
          time: at(0),
          values: { temperature: 20, errors: 2, online: null }
        },
        {
          resourceId: 1,
          time: at(1),
          values: { temperature: null, errors: null, online: true }
        }
      ]);
    });

    test('dates a point without a time now', async () => {
      const before = Date.now();
      await service.write('Sensor', [{ resourceId: 1, values: { errors: 1 } }]);

      const [point] = await service.query('Sensor', { resourceIds: [1] });
      expect(point.time.getTime()).toBeGreaterThanOrEqual(before);
    });

    test('accepts no points', async () => {
      await expect(service.write('Sensor', [])).resolves.toEqual({
        count: 0,
        queued: false
      });
    });

    test.each([
      [{ humidity: 1 }, ErrorCode.TimeSeriesInvalidField],
      [{ temperature: 'hot' }, ErrorCode.TimeSeriesInvalidValue],
      [{ temperature: Infinity }, ErrorCode.TimeSeriesInvalidValue],
      [{ temperature: 200 }, ErrorCode.TimeSeriesInvalidValue],
      [{ temperature: -60 }, ErrorCode.TimeSeriesInvalidValue],
      [{ errors: 1.5 }, ErrorCode.TimeSeriesInvalidValue],
      [{ online: 1 }, ErrorCode.TimeSeriesInvalidValue],
      [{ online: null }, ErrorCode.TimeSeriesInvalidValue]
    ])('rejects the values %j', async (values, code) => {
      await expect(
        service.write('Sensor', [{ resourceId: 1, values: values as any }])
      ).rejects.toMatchObject({ code });
    });

    test('rejects an invalid time', async () => {
      await expect(
        service.write('Sensor', [
          { resourceId: 1, time: 'yesterday', values: { errors: 1 } }
        ])
      ).rejects.toMatchObject({ code: ErrorCode.TimeSeriesInvalidTime });
    });

    test('rejects more points than allowed', async () => {
      configOverrides.TIMESERIES_MAX_POINTS_PER_WRITE = 1;
      const points = [
        { resourceId: 1, time: at(0), values: { errors: 1 } },
        { resourceId: 1, time: at(1), values: { errors: 1 } }
      ];

      await expect(service.write('Sensor', points)).rejects.toMatchObject({
        code: ErrorCode.TimeSeriesTooManyPoints,
        details: { maxPoints: 1 }
      });
      await expect(
        service.write('Sensor', points, { maxPoints: 2 })
      ).resolves.toMatchObject({
        count: 2
      });
    });
  });

  describe('write in a transaction', () => {
    const transaction = (): TransactionContext => ({
      tx: {},
      commitCallbacks: new Map(),
      rollbackCallbacks: []
    });

    test('waits for the commit on a store outside the database, and drops the points on a rollback', async () => {
      const committed = transaction();
      const rolledBack = transaction();
      const point = { resourceId: 1, time: at(0), values: { errors: 1 } };

      await runInTransaction(committed, () => service.write('Sensor', [point]));
      await runInTransaction(rolledBack, () =>
        service.write('Sensor', [{ ...point, resourceId: 2 }])
      );
      await expect(
        service.query('Sensor', { resourceIds: [1, 2] })
      ).resolves.toEqual([]);

      await settleTransaction(committed, true);
      await settleTransaction(rolledBack, false);
      await new Promise((resolve) => setImmediate(resolve));

      await expect(
        service.query('Sensor', { resourceIds: [1, 2] })
      ).resolves.toHaveLength(1);
    });

    test('writes in the transaction on a store of the database', async () => {
      Object.assign(store, { transactional: true });

      await runInTransaction(transaction(), () =>
        service.write('Sensor', [
          { resourceId: 1, time: at(0), values: { errors: 1 } }
        ])
      );

      await expect(
        service.query('Sensor', { resourceIds: [1] })
      ).resolves.toHaveLength(1);
    });

    test('logs a write failing after the commit', async () => {
      jest.spyOn(logger, 'error').mockImplementation();
      jest.spyOn(store, 'write').mockRejectedValue(new Error('Down'));
      const committed = transaction();

      await runInTransaction(committed, () =>
        service.write('Sensor', [{ resourceId: 1, values: { errors: 1 } }])
      );
      await settleTransaction(committed, true);
      await new Promise((resolve) => setImmediate(resolve));

      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('ingestOf', () => {
    test('writes directly by default and without a queue', () => {
      jest.spyOn(logger, 'warn').mockImplementation();

      expect(service.ingestOf('Sensor')).toBe('direct');
      expect(service.ingestOf('Device')).toBe('direct');
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test('queues on any queue, and on a durable one only for auto', () => {
      define(new MemoryQueue(), Queue);

      expect(service.ingestOf('Device')).toBe('queue');
      expect(service.ingestOf('Device', 'direct')).toBe('direct');
      expect(service.ingestOf('Sensor', 'auto')).toBe('direct');
    });

    test('queues for auto on a durable queue', () => {
      define({ get: jest.fn() }, Queue);
      configOverrides.TIMESERIES_INGEST = 'auto';

      expect(service.ingestOf('Sensor')).toBe('queue');
    });
  });

  describe('queued writes', () => {
    let queue: MemoryQueue;

    beforeEach(() => {
      queue = new MemoryQueue();
      define(queue, Queue);
    });

    afterEach(async () => {
      await queue.closeAll();
    });

    test('sends the points to the queue in batches, and the worker writes them', async () => {
      configOverrides.TIMESERIES_QUEUE_BATCH_SIZE = 2;
      const sendBulkJobs = jest.spyOn(queue.get('timeseries'), 'sendBulkJobs');
      await service.onReady();

      const result = await service.write('Device', [
        { resourceId: 'a', time: at(0), values: { load: 1 } },
        { resourceId: 'a', time: at(1), values: { load: 2 } },
        { resourceId: 'b', time: at(0), values: { load: 3 } }
      ]);

      expect(result).toEqual({ count: 3, queued: true });
      expect(sendBulkJobs.mock.calls[0][0]).toHaveLength(2);
      await until(
        async () =>
          (await service.query('Device', { resourceIds: ['a', 'b'] }))
            .length === 3
      );
    });

    test('does not start the worker when disabled or nothing is queued', async () => {
      const addWorker = jest.spyOn(queue.get('timeseries'), 'addWorker');
      configOverrides.TIMESERIES_QUEUE_WORKER = false;
      await service.onReady();
      delete configOverrides.TIMESERIES_QUEUE_WORKER;
      context.resource.models.delete('Device');
      await service.onReady();

      expect(addWorker).not.toHaveBeenCalled();
    });

    test('drops the points of a deleted resource and writes the others', async () => {
      jest.spyOn(logger, 'warn').mockImplementation();
      const write = jest
        .spyOn(store, 'write')
        .mockImplementation(async (_model, points) => {
          if (points.some((point) => point.resourceId === 'gone')) {
            throw new DatabaseError(
              ErrorCode.DatabaseForeignKeyViolation,
              'Missing',
              {
                fields: ['resourceId']
              }
            );
          }
          return points.length;
        });
      let worker!: (job: any) => Promise<number>;
      jest
        .spyOn(queue.get('timeseries'), 'addWorker')
        .mockImplementation((fn: any) => {
          worker = fn;
          return {} as any;
        });
      await service.onReady();

      const job = {
        data: {
          model: 'Device',
          points: [
            { resourceId: 'a', time: at(0).toISOString(), values: { load: 1 } },
            {
              resourceId: 'gone',
              time: at(0).toISOString(),
              values: { load: 2 }
            }
          ]
        }
      };

      await expect(worker(job)).resolves.toBe(1);
      expect(write).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(1);

      write.mockRejectedValue(new Error('Down'));
      await expect(worker(job)).rejects.toThrow('Down');
    });

    test('retries a job failing with a later resource error', async () => {
      let calls = 0;
      jest.spyOn(store, 'write').mockImplementation(async () => {
        calls++;
        throw calls === 1
          ? new DatabaseError(
              ErrorCode.DatabaseForeignKeyViolation,
              'Missing',
              {
                fields: ['resourceId']
              }
            )
          : new Error('Down');
      });
      let worker!: (job: any) => Promise<number>;
      jest
        .spyOn(queue.get('timeseries'), 'addWorker')
        .mockImplementation((fn: any) => {
          worker = fn;
          return {} as any;
        });
      await service.onReady();

      await expect(
        worker({
          data: {
            model: 'Device',
            points: [{ resourceId: 'a', time: at(0), values: { load: 1 } }]
          }
        })
      ).rejects.toThrow('Down');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await service.write('Sensor', [
        { resourceId: 1, time: at(0), values: { temperature: 10 } },
        { resourceId: 1, time: at(30), values: { temperature: 20 } },
        { resourceId: 1, time: at(70), values: { temperature: 30 } }
      ]);
    });

    test('aggregates by a bucket duration, by average unless given', async () => {
      const points = await service.query('Sensor', {
        resourceIds: ['1'],
        fields: ['temperature'],
        bucket: '1h'
      });

      expect(points.map((point) => point.values.temperature)).toEqual([15, 30]);
    });

    test('applies the range, the order and the limit', async () => {
      const points = await service.query('Sensor', {
        resourceIds: [1],
        from: at(0).toISOString(),
        to: at(70),
        order: 'desc',
        limit: 1
      });

      expect(points.map((point) => point.values.temperature)).toEqual([20]);
    });

    test('limits the points to the maximum of a query', async () => {
      configOverrides.TIMESERIES_MAX_POINTS_PER_QUERY = 2;

      await expect(
        service.query('Sensor', { resourceIds: [1], limit: 10 })
      ).resolves.toHaveLength(2);
    });

    test('returns no points for no resources', async () => {
      await expect(
        service.query('Sensor', { resourceIds: [] })
      ).resolves.toEqual([]);
    });

    test.each([
      [{ fields: ['humidity'] }, ErrorCode.TimeSeriesInvalidField],
      [{ from: at(2), to: at(1) }, ErrorCode.TimeSeriesInvalidRange],
      [{ bucket: 'soon' }, ErrorCode.TimeSeriesInvalidBucket],
      [{ bucket: '500ms' }, ErrorCode.TimeSeriesInvalidBucket],
      [{ aggregate: 'median' }, ErrorCode.TimeSeriesInvalidAggregate]
    ])('rejects the query %j', async (query, code) => {
      await expect(
        service.query('Sensor', { resourceIds: [1], ...(query as any) })
      ).rejects.toMatchObject({ code });
    });

    test('rejects more resources than allowed', async () => {
      configOverrides.TIMESERIES_MAX_RESOURCES_PER_QUERY = 1;

      await expect(
        service.query('Sensor', { resourceIds: [1, 2] })
      ).rejects.toMatchObject({
        code: ErrorCode.TimeSeriesTooManyResources
      });
    });
  });

  describe('delete', () => {
    test('deletes the points of a range', async () => {
      await service.write('Sensor', [
        { resourceId: 1, time: at(0), values: { errors: 1 } },
        { resourceId: 1, time: at(1), values: { errors: 2 } }
      ]);

      await expect(
        service.delete('Sensor', { resourceIds: [1], from: at(1) })
      ).resolves.toBe(1);
      await expect(service.delete('Sensor', { resourceIds: [] })).resolves.toBe(
        0
      );
      await expect(
        service.delete('Sensor', { resourceIds: [1], from: at(2), to: at(1) })
      ).rejects.toMatchObject({ code: ErrorCode.TimeSeriesInvalidRange });
    });

    test('fails on a store not deleting points', async () => {
      Object.assign(store, { supportsDelete: false });

      await expect(
        service.delete('Sensor', { resourceIds: [1] })
      ).rejects.toMatchObject({
        code: ErrorCode.TimeSeriesUnsupported
      });
    });
  });

  describe('purgeResources', () => {
    beforeEach(async () => {
      await service.write('Sensor', [
        { resourceId: 1, time: at(0), values: { errors: 1 } }
      ]);
    });

    test('deletes the points of the deleted resources', async () => {
      await service.purgeResources('Sensor', [1]);

      await expect(
        service.query('Sensor', { resourceIds: [1] })
      ).resolves.toEqual([]);
    });

    test('leaves the points to a store deleting them by itself', async () => {
      Object.assign(store, { cascadesDeletes: true });
      await service.purgeResources('Sensor', [1]);
      await service.purgeResources('Plain', [1]);
      await service.purgeResources('Sensor', []);

      await expect(
        service.query('Sensor', { resourceIds: [1] })
      ).resolves.toHaveLength(1);
    });

    test('logs a failed delete', async () => {
      jest.spyOn(logger, 'error').mockImplementation();
      jest.spyOn(store, 'delete').mockRejectedValue(new Error('Down'));

      await service.purgeResources('Sensor', [1]);

      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  test('starts with an unreachable store, registering the models on the next use', async () => {
    jest.spyOn(logger, 'error').mockImplementation();
    const register = jest
      .spyOn(store, 'register')
      .mockRejectedValueOnce(new Error('Down'));

    await expect(service.onReady()).resolves.toBeUndefined();
    await service.query('Sensor', { resourceIds: [1] });

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(2);
  });

  test('fails the start on an invalid setup of the store', async () => {
    jest
      .spyOn(store, 'register')
      .mockRejectedValueOnce(
        new ConfigurationError(
          ErrorCode.ConfigurationInvalid,
          'Invalid retention'
        )
      );

    await expect(service.onReady()).rejects.toThrow('Invalid retention');
  });
});
