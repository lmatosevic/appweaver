import { isModule } from '@appweaver/common';
import manifest from '../src/module';

describe('module', () => {
  test('exports the manifest of the module', () => {
    expect(isModule(manifest)).toBe(true);
    expect(manifest.name).toBe('{{PACKAGE_NAME}}');
  });
});
