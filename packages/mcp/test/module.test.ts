import path from 'node:path';
import { sourceLoggerNames } from '@appweaver/testing';
import * as sections from '../config';
import manifest from '../module';

describe('module', () => {
  test('lists every config section of the package', () => {
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

  test('requires the web module and registers its routes', async () => {
    expect(manifest.requires).toEqual(['@appweaver/web']);
    await expect(manifest.web!()).resolves.toBeUndefined();
  });
});
