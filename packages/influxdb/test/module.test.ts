import path from 'node:path';
import { sourceLoggerNames } from '@appweaver/testing';
import manifest from '../module';

describe('module', () => {
  test('lists every logger of the package', () => {
    expect([...(manifest.loggers ?? [])].sort()).toEqual(
      sourceLoggerNames(path.join(__dirname, '..'))
    );
  });

  test('loads the influxdb provider of TimeSeries', async () => {
    const [provider] = manifest.providers ?? [];

    expect(provider.name).toBe('influxdb');
    await expect(provider.load()).resolves.toHaveProperty('InfluxTimeSeries');
  });
});
