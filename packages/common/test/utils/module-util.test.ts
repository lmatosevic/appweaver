import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  importModule,
  loadModule,
  requireModule
} from '../../utils/module-util';

describe('module-util', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-module-'));
    fs.mkdirSync(path.join(tempDir, 'services'), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, 'named.js'),
      'module.exports = { value: 42, name: "named" };'
    );
    fs.writeFileSync(
      path.join(tempDir, 'default.js'),
      'Object.defineProperty(exports, "__esModule", { value: true });\n' +
        'exports.default = { value: "default-export" };'
    );
    fs.writeFileSync(
      path.join(tempDir, 'no-default.js'),
      'Object.defineProperty(exports, "__esModule", { value: true });\n' +
        'exports.default = null;\n' +
        'exports.named = "named-export";'
    );
    fs.writeFileSync(
      path.join(tempDir, 'broken.js'),
      'throw new Error("module failure");'
    );
    fs.writeFileSync(
      path.join(tempDir, 'empty.js'),
      'module.exports = undefined;'
    );
    fs.writeFileSync(
      path.join(tempDir, 'services', 'example.js'),
      'module.exports = { service: "example" };'
    );
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('requireModule', () => {
    test('loads an existing module', () => {
      const { value, error } = requireModule(path.join(tempDir, 'named.js'));
      expect(error).toBeNull();
      expect(value).toEqual({ value: 42, name: 'named' });
    });

    test('sanitizes a .ts path to .js', () => {
      const { value, error } = requireModule(path.join(tempDir, 'named.ts'));
      expect(error).toBeNull();
      expect(value.name).toBe('named');
    });

    test('returns the error instead of throwing by default', () => {
      const { value, error } = requireModule(path.join(tempDir, 'missing.js'));
      expect(value).toBeNull();
      expect(error?.message).toContain('Cannot find module');
    });

    test('throws when failOnError is true', () => {
      expect(() =>
        requireModule(path.join(tempDir, 'missing.js'), true)
      ).toThrow();
    });

    test('captures an error thrown by the module itself', () => {
      const { value, error } = requireModule(path.join(tempDir, 'broken.js'));
      expect(value).toBeNull();
      expect(error?.message).toBe('module failure');
    });
  });

  describe('importModule', () => {
    test('loads an existing module', async () => {
      const { value, error } = await importModule(
        path.join(tempDir, 'named.js')
      );
      expect(error).toBeNull();
      expect(value.value).toBe(42);
    });

    test('prefers the default export when present', async () => {
      const { value, error } = await importModule(
        path.join(tempDir, 'default.js')
      );
      expect(error).toBeNull();
      expect(value).toEqual({ value: 'default-export' });
    });

    test('falls back to the whole module when there is no default export', async () => {
      const { value, error } = await importModule(
        path.join(tempDir, 'no-default.js')
      );
      expect(error).toBeNull();
      expect(value.named).toBe('named-export');
    });

    test('returns the error instead of throwing by default', async () => {
      const { value, error } = await importModule(
        path.join(tempDir, 'missing.js')
      );
      expect(value).toBeNull();
      expect(error?.message).toContain('Cannot find module');
    });

    test('throws when failOnError is true', async () => {
      await expect(
        importModule(path.join(tempDir, 'missing.js'), true)
      ).rejects.toThrow();
    });
  });

  describe('loadModule', () => {
    test('loads a module from the project source path prefix', () => {
      const { value, error } = loadModule(tempDir, '@/services/example');
      expect(error).toBeNull();
      expect(value).toEqual({ service: 'example' });
    });

    test('loads a module from a relative path', () => {
      const { value, error } = loadModule(tempDir, './services/example');
      expect(error).toBeNull();
      expect(value).toEqual({ service: 'example' });
    });

    test('loads a module from node_modules', () => {
      const { value, error } = loadModule(tempDir, 'node:path');
      expect(error).toBeNull();
      expect(value.join).toBe(path.join);
    });

    test('returns an error for a module that cannot be resolved', () => {
      const { value, error } = loadModule(tempDir, '@/services/missing');
      expect(value).toBeNull();
      expect(error?.message).toContain('Cannot find module');
    });

    test('returns an error when the module exports nothing', () => {
      const { value, error } = loadModule(tempDir, './empty');
      expect(value).toBeNull();
      expect(error?.message).toContain("Loading './empty' module failed");
    });

    test('throws when failOnError is true', () => {
      expect(() => loadModule(tempDir, '@/services/missing', true)).toThrow();
    });
  });
});
