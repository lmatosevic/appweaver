import path from 'node:path';
import { sourceLoggerNames } from '@appweaver/testing';
import manifest from '../module';

describe('module', () => {
  test('lists every logger of the package', () => {
    expect([...(manifest.loggerNames ?? [])].sort()).toEqual(
      sourceLoggerNames(path.join(__dirname, '..'))
    );
  });
});
