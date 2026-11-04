import {
  contractSeriesModel,
  testTimeSeriesContract
} from '@appweaver/testing';
import { MemoryTimeSeries } from '../../timeseries/memory-time-series';

testTimeSeriesContract('MemoryTimeSeries', () => new MemoryTimeSeries());

describe('MemoryTimeSeries', () => {
  test('keeps the points of each table apart and clears them on destroy', async () => {
    const store = new MemoryTimeSeries();
    const other = { ...contractSeriesModel, table: 'OtherSeries' };
    const time = new Date(0);
    await store.write(contractSeriesModel, [
      { resourceId: 1, time, values: { count: 1 } }
    ]);

    await expect(store.query(other, { resourceIds: [1] })).resolves.toEqual([]);
    await store.onDestroy();
    await expect(
      store.query(contractSeriesModel, { resourceIds: [1] })
    ).resolves.toEqual([]);
  });

  test('returns no value for a field without points in a bucket', async () => {
    const store = new MemoryTimeSeries();
    await store.write(contractSeriesModel, [
      { resourceId: 1, time: new Date(0), values: { count: 1 } }
    ]);

    const [point] = await store.query(contractSeriesModel, {
      resourceIds: [1],
      bucket: 60,
      aggregate: 'max'
    });

    expect(point.values).toEqual({ temperature: null, count: 1, online: null });
  });
});
