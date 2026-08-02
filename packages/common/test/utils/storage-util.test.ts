import path from 'node:path';
import {
  findReservedStoragePath,
  isReservedStoragePath,
  normalizeStoragePath,
  resolveStoragePath
} from '../../utils/storage-util';

describe('storage-util', () => {
  describe('normalizeStoragePath', () => {
    test('normalizes a relative path', () => {
      expect(normalizeStoragePath('posts/1/image.png')).toBe(
        'posts/1/image.png'
      );
    });

    test('unifies backslashes and removes redundant segments', () => {
      expect(normalizeStoragePath('.\\posts\\\\1//image.png')).toBe(
        'posts/1/image.png'
      );
    });

    test('rejects traversal segments', () => {
      expect(normalizeStoragePath('../keys/private.key')).toBeNull();
      expect(normalizeStoragePath('posts/../../keys/private.key')).toBeNull();
      expect(normalizeStoragePath('posts/..\\..\\keys')).toBeNull();
    });

    test('rejects absolute paths', () => {
      expect(normalizeStoragePath('/etc/passwd')).toBeNull();
      expect(normalizeStoragePath('C:\\Windows\\system.ini')).toBeNull();
      expect(normalizeStoragePath('\\\\server\\share\\file.txt')).toBeNull();
    });

    test('rejects empty and control character paths', () => {
      expect(normalizeStoragePath('')).toBeNull();
      expect(normalizeStoragePath('   ')).toBeNull();
      expect(normalizeStoragePath('./')).toBeNull();
      expect(normalizeStoragePath(`keys${String.fromCharCode(0)}.png`)).toBe(
        null
      );
      expect(normalizeStoragePath(undefined as any)).toBeNull();
    });
  });

  describe('resolveStoragePath', () => {
    test('resolves a file name inside the storage root', () => {
      expect(resolveStoragePath('./storage', 'posts/image.png')).toBe(
        path.resolve('./storage/posts/image.png')
      );
    });

    test('rejects file names escaping the storage root', () => {
      expect(resolveStoragePath('./storage', '../secrets.txt')).toBeNull();
      expect(resolveStoragePath('./storage', '/etc/passwd')).toBeNull();
    });
  });

  describe('findReservedStoragePath', () => {
    test('matches a reserved directory and everything inside it', () => {
      expect(findReservedStoragePath('keys', ['keys'])).toBe('keys');
      expect(findReservedStoragePath('keys/private.key', ['keys'])).toBe(
        'keys'
      );
      expect(findReservedStoragePath('keys/nested/file.png', ['keys'])).toBe(
        'keys'
      );
    });

    test('matches a reserved full file name', () => {
      expect(
        findReservedStoragePath('internal/report.csv', ['internal/report.csv'])
      ).toBe('internal/report.csv');
      expect(
        findReservedStoragePath('internal/other.csv', ['internal/report.csv'])
      ).toBeNull();
    });

    test('compares whole path segments only', () => {
      expect(
        findReservedStoragePath('keysbackup/file.png', ['keys'])
      ).toBeNull();
      expect(
        findReservedStoragePath('posts/keys/file.png', ['keys'])
      ).toBeNull();
    });

    test('is case insensitive', () => {
      expect(findReservedStoragePath('Keys/Private.Key', ['keys'])).toBe(
        'keys'
      );
      expect(findReservedStoragePath('keys/private.key', ['KEYS'])).toBe(
        'KEYS'
      );
    });

    test('normalizes separators and leading slashes of reserved entries', () => {
      expect(findReservedStoragePath('keys\\private.key', ['keys'])).toBe(
        'keys'
      );
      expect(findReservedStoragePath('keys/private.key', ['/keys'])).toBe(
        '/keys'
      );
      expect(
        findReservedStoragePath('internal/reports/q1.csv', [
          '.\\internal\\reports'
        ])
      ).toBe('.\\internal\\reports');
    });

    test('trims reserved entries coming from a comma separated variable', () => {
      expect(
        findReservedStoragePath('internal/report.csv', [
          'keys',
          ' internal/report.csv '
        ])
      ).toBe(' internal/report.csv ');
    });

    test('returns the first matching reserved path', () => {
      expect(
        findReservedStoragePath('keys/private.key', ['logs', 'keys'])
      ).toBe('keys');
    });

    test('returns null for empty or invalid inputs', () => {
      expect(findReservedStoragePath('keys/private.key', [])).toBeNull();
      expect(
        findReservedStoragePath('keys/private.key', undefined as any)
      ).toBeNull();
      expect(findReservedStoragePath('', ['keys'])).toBeNull();
      expect(findReservedStoragePath('../keys', ['keys'])).toBeNull();
      expect(findReservedStoragePath('keys/private.key', ['', '.'])).toBeNull();
      expect(
        findReservedStoragePath('keys/private.key', [null as any])
      ).toBeNull();
    });

    test('does not support wildcard patterns', () => {
      expect(findReservedStoragePath('keys/private.key', ['*'])).toBeNull();
      expect(findReservedStoragePath('keys/private.key', ['key*'])).toBeNull();
    });
  });

  describe('isReservedStoragePath', () => {
    test('reports whether a path is reserved', () => {
      expect(isReservedStoragePath('keys/private.key', ['keys'])).toBe(true);
      expect(isReservedStoragePath('posts/image.png', ['keys'])).toBe(false);
      expect(isReservedStoragePath('posts/image.png')).toBe(false);
    });
  });
});
