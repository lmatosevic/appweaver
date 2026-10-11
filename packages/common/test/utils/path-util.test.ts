import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findFilesByPattern,
  isTypeScriptRuntime,
  resolveSourcePath,
  sanitizePath
} from '../../utils/path-util';

/**
 * Jest makes the test file the main module, so declaring the Bun global is enough
 * to make `isTypeScriptRuntime()` report a TS runtime. Runs in a temporary project
 * directory, with or without its source directory.
 */
const withBunRuntime = <T>(fn: () => T, withSources: boolean = true): T => {
  const cwd = process.cwd();
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-bun-'));
  if (withSources) {
    fs.mkdirSync(path.join(projectDir, 'src'));
  }
  globalThis['Bun'] = {} as never;
  process.chdir(projectDir);
  try {
    return fn();
  } finally {
    process.chdir(cwd);
    delete (globalThis as any)['Bun'];
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
};

describe('path-util', () => {
  describe('isTypeScriptRuntime', () => {
    test('is false when the Bun runtime is not available', () => {
      expect(typeof globalThis['Bun']).toBe('undefined');
      expect(isTypeScriptRuntime()).toBe(false);
    });

    test('is true when running TypeScript sources on the Bun runtime', () => {
      expect(withBunRuntime(() => isTypeScriptRuntime())).toBe(true);
    });

    test('is true for the CLI on the Bun runtime when the sources are present', () => {
      const cliPath = path.resolve('node_modules/.bin/weaver');
      expect(withBunRuntime(() => isTypeScriptRuntime(cliPath))).toBe(true);
    });

    test('is false for the CLI on the Bun runtime when only the build output is present', () => {
      const cliPath = path.resolve('node_modules/.bin/weaver');
      expect(withBunRuntime(() => isTypeScriptRuntime(cliPath), false)).toBe(
        false
      );
    });

    test('is false when running the build output on the Bun runtime', () => {
      const mainPath = path.resolve('dist/src/main.js');
      expect(withBunRuntime(() => isTypeScriptRuntime(mainPath))).toBe(false);
    });
  });

  describe('sanitizePath', () => {
    test('replaces a .ts extension with .js', () => {
      expect(sanitizePath('src/main.ts')).toBe('src/main.js');
      expect(sanitizePath('src/main.TS')).toBe('src/main.js');
    });

    test('only replaces the trailing extension', () => {
      expect(sanitizePath('src/a.ts.b.ts')).toBe('src/a.ts.b.js');
      expect(sanitizePath('src/ts.folder/file.ts')).toBe(
        'src/ts.folder/file.js'
      );
    });

    test('leaves other paths unchanged', () => {
      expect(sanitizePath('src/main.js')).toBe('src/main.js');
      expect(sanitizePath('src/**/*.json')).toBe('src/**/*.json');
      expect(sanitizePath('')).toBe('');
    });

    test('sanitizes glob patterns', () => {
      expect(sanitizePath('./src/**/model.ts')).toBe('./src/**/model.js');
    });

    test('keeps the .ts extension on a TypeScript runtime', () => {
      expect(withBunRuntime(() => sanitizePath('src/main.ts'))).toBe(
        'src/main.ts'
      );
    });
  });

  describe('resolveSourcePath', () => {
    test('resolves the override path when provided', () => {
      expect(resolveSourcePath('./dist', './src', './custom')).toBe(
        path.resolve('./custom')
      );
    });

    test('joins the build and target paths outside of a TypeScript runtime', () => {
      expect(resolveSourcePath('./dist', './src')).toBe(
        path.resolve(path.join('./dist', './src'))
      );
    });

    test('falls back to the cwd based path when the build path is empty', () => {
      expect(resolveSourcePath('', './src')).toBe(
        path.join(process.cwd(), '.')
      );
      expect(resolveSourcePath('', '', undefined, './fallback')).toBe(
        path.join(process.cwd(), './fallback')
      );
    });

    test('falls back when the target path is empty', () => {
      expect(resolveSourcePath('./dist', '', undefined, './other')).toBe(
        path.join(process.cwd(), './other')
      );
    });

    test('resolves the target path directly on a TypeScript runtime', () => {
      const [resolved, expected] = withBunRuntime(() => [
        resolveSourcePath('./dist', './src'),
        path.resolve('./src')
      ]);
      expect(resolved).toBe(expected);
    });

    test('prefers the override path over everything else', () => {
      expect(resolveSourcePath('', '', '/tmp/override')).toBe(
        path.resolve('/tmp/override')
      );
    });
  });

  describe('findFilesByPattern', () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-path-'));
      fs.mkdirSync(path.join(tempDir, 'src', 'user'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'src', 'post'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'user', 'model.js'), '');
      fs.writeFileSync(path.join(tempDir, 'src', 'user', 'index.js'), '');
      fs.writeFileSync(path.join(tempDir, 'src', 'post', 'model.js'), '');
      fs.writeFileSync(path.join(tempDir, 'src', 'readme.md'), '');
    });

    afterAll(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const relative = (files: string[]): string[] =>
      files
        .map((file) => path.relative(tempDir, file).replace(/\\/g, '/'))
        .sort();

    test('finds files matching the pattern', async () => {
      const files = await findFilesByPattern('./src/**/model.js', tempDir);
      expect(relative(files)).toEqual([
        'src/post/model.js',
        'src/user/model.js'
      ]);
    });

    test('returns absolute paths', async () => {
      const files = await findFilesByPattern('./src/**/model.js', tempDir);
      expect(files.every((file) => path.isAbsolute(file))).toBe(true);
    });

    test('returns a deterministic sorted result', async () => {
      const first = await findFilesByPattern('./src/**/*.js', tempDir);
      const second = await findFilesByPattern('./src/**/*.js', tempDir);
      expect(first).toEqual(second);
      expect([...first].sort()).toEqual(first);
    });

    test('sanitizes a .ts pattern to .js', async () => {
      const files = await findFilesByPattern('./src/**/model.ts', tempDir);
      expect(relative(files)).toEqual([
        'src/post/model.js',
        'src/user/model.js'
      ]);
    });

    test('returns an empty array when nothing matches', async () => {
      expect(await findFilesByPattern('./src/**/*.txt', tempDir)).toEqual([]);
    });

    test('strips the segments the pattern shares with the cwd', async () => {
      const cwd = path.join(tempDir, 'src');
      const files = await findFilesByPattern('src/**/model.js', cwd);
      expect(relative(files)).toEqual([
        'src/post/model.js',
        'src/user/model.js'
      ]);
    });

    test('resolves to the cwd itself when the pattern is fully overlapping', async () => {
      const cwd = path.join(tempDir, 'src');
      const files = await findFilesByPattern('src', cwd);
      expect(files.map((file) => path.resolve(file))).toEqual([
        path.resolve(cwd)
      ]);
    });

    test('keeps the overlapping segments when stripping is disabled', async () => {
      const cwd = path.join(tempDir, 'src');
      const files = await findFilesByPattern('src/**/model.js', cwd, false);
      expect(files).toEqual([]);
    });
  });
});
