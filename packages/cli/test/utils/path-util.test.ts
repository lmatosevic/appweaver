import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertPathInside,
  ensureDirExists,
  isPathInside,
  relativePathFrom,
  rimrafPath
} from '../../utils/path-util';

describe('path-util', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-cli-path-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('relativePathFrom', () => {
    test('resolves a path relative to the directory of the first path', () => {
      expect(
        relativePathFrom('./database/schema.prisma', './database/client')
      ).toBe('./client');
    });

    test('resolves a path in a parent directory', () => {
      expect(
        relativePathFrom('./database/schema.prisma', './generated/client')
      ).toBe('../generated/client');
    });

    test('returns a dot when both paths resolve to the same directory', () => {
      expect(relativePathFrom('./database/schema.prisma', './database')).toBe(
        '.'
      );
    });

    test('always uses forward slashes', () => {
      expect(
        relativePathFrom('./database/schema.prisma', './database/client/nested')
      ).toBe('./client/nested');
    });

    test('accepts absolute paths', () => {
      const schemaPath = path.join(tempDir, 'database', 'schema.prisma');
      const clientPath = path.join(tempDir, 'database', 'client');

      expect(relativePathFrom(schemaPath, clientPath)).toBe('./client');
    });
  });

  describe('isPathInside', () => {
    test('returns true for a direct child', () => {
      expect(isPathInside('/temp/dir', '/temp/dir/file.txt')).toBe(true);
    });

    test('returns true for a nested child', () => {
      expect(isPathInside('/temp/dir', '/temp/dir/nested/file.txt')).toBe(true);
    });

    test('returns false for the base path itself', () => {
      expect(isPathInside('/temp/dir', '/temp/dir')).toBe(false);
    });

    test('returns false for a sibling with the same prefix', () => {
      expect(isPathInside('/temp/dir', '/temp/dir2/file.txt')).toBe(false);
    });

    test('returns false for a path outside of the base path', () => {
      expect(isPathInside('/temp/dir', '/other/file.txt')).toBe(false);
      expect(isPathInside('/temp/dir', '/temp')).toBe(false);
    });

    test('resolves relative paths against the working directory', () => {
      expect(isPathInside('./temp', './temp/db.sqlite')).toBe(true);
      expect(isPathInside('./temp', './storage/db.sqlite')).toBe(false);
    });

    test('normalizes traversal segments', () => {
      expect(isPathInside('/temp/dir', '/temp/dir/../dir/file.txt')).toBe(true);
      expect(isPathInside('/temp/dir', '/temp/dir/../../file.txt')).toBe(false);
    });
  });

  describe('assertPathInside', () => {
    test('does nothing when the path is inside the base path', () => {
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() =>
        assertPathInside('/temp/dir', '/temp/dir/file.txt', 'Invalid path')
      ).not.toThrow();
      expect(exit).not.toHaveBeenCalled();
    });

    test('logs the message and exits when the path is outside', () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() =>
        assertPathInside('/temp/dir', '/other/file.txt', 'Invalid path')
      ).toThrow('process.exit called');
      expect(error).toHaveBeenCalledWith('Invalid path');
      expect(exit).toHaveBeenCalledWith(1);
    });
  });

  describe('rimrafPath', () => {
    test('removes a file', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');

      await expect(rimrafPath(filePath)).resolves.toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('removes a directory recursively', async () => {
      const dirPath = path.join(tempDir, 'nested', 'deep');
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'file.txt'), 'content');

      await expect(rimrafPath(path.join(tempDir, 'nested'))).resolves.toBe(
        true
      );
      expect(fs.existsSync(path.join(tempDir, 'nested'))).toBe(false);
    });

    test('resolves to true for a path that does not exist', async () => {
      await expect(rimrafPath(path.join(tempDir, 'missing'))).resolves.toBe(
        true
      );
    });
  });

  describe('ensureDirExists', () => {
    test('creates the parent directory of the given file path', async () => {
      const filePath = path.join(tempDir, 'generated', 'types.ts');

      await ensureDirExists(filePath);

      expect(fs.existsSync(path.join(tempDir, 'generated'))).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('creates nested directories', async () => {
      const filePath = path.join(tempDir, 'a', 'b', 'c', 'schema.prisma');

      await ensureDirExists(filePath);

      expect(fs.existsSync(path.join(tempDir, 'a', 'b', 'c'))).toBe(true);
    });

    test('keeps an existing directory and its contents', async () => {
      const dirPath = path.join(tempDir, 'existing');
      fs.mkdirSync(dirPath);
      fs.writeFileSync(path.join(dirPath, 'keep.txt'), 'content');

      await ensureDirExists(path.join(dirPath, 'types.ts'));

      expect(fs.readFileSync(path.join(dirPath, 'keep.txt'), 'utf8')).toBe(
        'content'
      );
    });
  });
});
