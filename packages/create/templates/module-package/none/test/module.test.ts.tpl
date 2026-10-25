import path from 'node:path';
import { isModule } from '@appweaver/common';
import { sourceLoggerNames } from '@appweaver/testing';
import manifest from '../src/module';

describe('module', () => {
  test('exports the manifest of the module', () => {
    expect(isModule(manifest)).toBe(true);
    expect(manifest.name).toBe('{{PACKAGE_NAME}}');
  });

  test('lists every logger of the module', () => {
    expect([...(manifest.loggerNames ?? [])].sort()).toEqual(
      sourceLoggerNames(path.join(__dirname, '../src'))
    );
  });
});
