import path from 'node:path';

// Prettier only ships an ESM build behind a dynamic import, which cannot be
// loaded by the CommonJS test runtime, so it is stubbed for this module.
jest.mock('prettier', () => ({
  __esModule: true,
  default: { format: jest.fn(), resolveConfig: jest.fn() }
}));

import { relativePathFrom } from '../../commands/generate-command';

describe('generate-command', () => {
  describe('relativePathFrom', () => {
    test('resolves a sibling file as an explicit relative import', () => {
      expect(relativePathFrom('./src/client.ts', './src/schema.ts')).toBe(
        './schema'
      );
    });

    test('resolves a file in a nested directory', () => {
      expect(relativePathFrom('./src/client.ts', './src/types/schema.ts')).toBe(
        './types/schema'
      );
    });

    test('resolves a file in a parent directory', () => {
      expect(relativePathFrom('./src/client/index.ts', './src/schema.ts')).toBe(
        '../schema'
      );
    });

    test('strips the .ts and .d.ts extensions', () => {
      expect(relativePathFrom('./src/client.ts', './src/schema.d.ts')).toBe(
        './schema'
      );
      expect(relativePathFrom('./src/client.ts', './src/api.ts')).toBe('./api');
    });

    test('keeps other extensions untouched', () => {
      expect(relativePathFrom('./src/client.ts', './src/schema.json')).toBe(
        './schema.json'
      );
    });

    test('always uses forward slashes', () => {
      expect(
        relativePathFrom('./src/client.ts', './src/generated/schema.ts')
      ).not.toContain(path.win32.sep);
    });

    test('returns the current directory when both paths share a directory name', () => {
      expect(relativePathFrom('./src/client.ts', './src')).toBe('.');
    });

    test('accepts absolute paths', () => {
      const clientPath = path.resolve('./src/client.ts');
      const typesPath = path.resolve('./src/schema.ts');

      expect(relativePathFrom(clientPath, typesPath)).toBe('./schema');
    });
  });
});
