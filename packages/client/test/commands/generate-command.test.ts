import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Prettier only ships an ESM build behind a dynamic import, which cannot be
// loaded by the CommonJS test runtime, so it is stubbed for this module.
jest.mock('prettier', () => ({
  __esModule: true,
  default: { format: jest.fn(), resolveConfig: jest.fn() }
}));

import { parseSchema, relativePathFrom } from '../../commands/generate-command';

describe('generate-command', () => {
  describe('parseSchema', () => {
    let tempDir: string;
    let schemaFile: string;
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-schema-arg-'));
      schemaFile = path.join(tempDir, 'openapi.json');
      fs.writeFileSync(schemaFile, '{"openapi":"3.0.3"}', 'utf8');
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('accepts the supported URL protocols', () => {
      expect(parseSchema('https://example.com/openapi.json')).toBe(
        'https://example.com/openapi.json'
      );
      expect(parseSchema('http://localhost:3000/openapi.json')).toBe(
        'http://localhost:3000/openapi.json'
      );
      expect(parseSchema('file:///tmp/openapi.json')).toBe(
        'file:///tmp/openapi.json'
      );
    });

    test('rejects an unsupported URL protocol', () => {
      expect(() => parseSchema('ftp://example.com/openapi.json')).toThrow(
        'Unsupported schema URL protocol'
      );
    });

    test('accepts an existing absolute file path', () => {
      expect(parseSchema(schemaFile)).toBe(schemaFile);
    });

    test('accepts an existing relative file path', () => {
      expect(parseSchema('./openapi.json')).toBe('./openapi.json');
    });

    test('rejects a file path that does not exist', () => {
      expect(() => parseSchema('./missing.json')).toThrow('does not exist');
    });

    test('rejects a Windows path as a missing file rather than a bad protocol', () => {
      expect(() => parseSchema('C:\\missing\\openapi.json')).toThrow(
        'does not exist'
      );
    });
  });

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
