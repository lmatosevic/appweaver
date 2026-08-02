import path from 'node:path';
import {
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
});
