import {
  generateFileName,
  sanitizeFilename,
  sanitizeFileSegment
} from '../../utils/file-util';

describe('file-util', () => {
  describe('sanitizeFilename', () => {
    test('removes characters which are invalid in file names', () => {
      expect(sanitizeFilename('in*va?li"d<>|:name.png')).toBe(
        'invalidname.png'
      );
    });

    test('removes control characters', () => {
      const name = `image${String.fromCharCode(0)}${String.fromCharCode(31)}.png`;
      expect(sanitizeFilename(name)).toBe('image.png');
    });

    test('keeps forward slashes, since a file name may be a storage path', () => {
      expect(sanitizeFilename('posts/1/image.png')).toBe('posts/1/image.png');
    });
  });

  describe('sanitizeFileSegment', () => {
    test('strips path separators and traversal', () => {
      expect(sanitizeFileSegment('../../keys/private')).toBe('keysprivate');
      expect(sanitizeFileSegment('keys/private')).toBe('keysprivate');
    });

    test('strips leading dots so hidden files cannot be created', () => {
      expect(sanitizeFileSegment('.env')).toBe('env');
      expect(sanitizeFileSegment('..')).toBe('');
      expect(sanitizeFileSegment('   ..   ')).toBe('');
      expect(sanitizeFileSegment('  .env  ')).toBe('env');
    });

    test('returns an empty string for non string values', () => {
      expect(sanitizeFileSegment(undefined)).toBe('');
      expect(sanitizeFileSegment(null)).toBe('');
    });
  });

  describe('generateFileName', () => {
    test('applies the given pattern', () => {
      expect(generateFileName('image.png', '{name}.{extension}')).toBe(
        'image.png'
      );
    });

    test('keeps directories coming from the pattern', () => {
      const fileName = generateFileName(
        'image.png',
        'photos/{resourceId}/{name}.{extension}',
        { resourceId: 7 }
      );
      expect(fileName).toBe('photos/7/image.png');
    });

    test('does not let an uploaded file name introduce a directory', () => {
      const fileName = generateFileName(
        'keys/private.key',
        '{name}.{extension}'
      );
      expect(fileName).toBe('keysprivate.key');
    });

    test('does not let an uploaded file name traverse the storage root', () => {
      const fileName = generateFileName(
        '../../keys/private.key',
        '{name}.{extension}'
      );
      expect(fileName).not.toContain('..');
      expect(fileName).not.toContain('/');
    });

    test('sanitizes substituted variables', () => {
      const fileName = generateFileName(
        'image.png',
        '{userEmail}-{name}.{extension}',
        {
          userEmail: '../../keys/user@mail.com'
        }
      );
      expect(fileName).toBe('keysuser@mail.com-image.png');
    });

    test('falls back to a safe name when the pattern resolves to nothing', () => {
      expect(generateFileName('image.png', '.')).toBe('image.png');
      expect(generateFileName('../../etc/passwd', '.')).toBe('etcpasswd');
    });

    test('falls back to a generated token when nothing usable remains', () => {
      // Reached only when the original name has no usable characters either,
      // which means there is no extension left to preserve.
      const fileName = generateFileName('   ..   ', '.');
      expect(fileName).toMatch(/^[a-f0-9]+$/);
    });
  });
});
