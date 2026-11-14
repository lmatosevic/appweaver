import path from 'node:path';
import { sourceLoggerNames } from '@appweaver/testing';
import * as sections from '../config';
import manifest from '../module';

describe('module', () => {
  test('lists every config section of the package', () => {
    // A section is frozen, unlike the enums exported beside it
    const all = Object.values(sections).filter((value) =>
      Object.isFrozen(value)
    );

    expect(new Set(manifest.config)).toEqual(new Set(all));
  });

  test('lists every logger of the package', () => {
    expect([...(manifest.loggers ?? [])].sort()).toEqual(
      sourceLoggerNames(path.join(__dirname, '..'))
    );
  });

  test('loads the telemetry service', async () => {
    const [service] = manifest.services ?? [];

    expect(await service.load()).toHaveProperty('TelemetryService');
  });
});
