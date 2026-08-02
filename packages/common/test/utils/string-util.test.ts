import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { getDayOfYear, getISOWeek } from 'date-fns';
import {
  camelToSnakeCase,
  capitalize,
  compareVersions,
  errorMessage,
  generateToken,
  makeHash,
  makeUrlSlug,
  parseArray,
  plural,
  randomString,
  replacePatternVariables,
  singular,
  snakeToCamelCase,
  textToBytes,
  uncapitalize,
  uuid
} from '../../utils/string-util';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('string-util', () => {
  describe('parseArray', () => {
    test('splits a comma separated string', () => {
      expect(parseArray('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    test('returns a single element array without a delimiter', () => {
      expect(parseArray('single')).toEqual(['single']);
    });

    test('supports a custom delimiter', () => {
      expect(parseArray('a;b', [], ';')).toEqual(['a', 'b']);
    });

    test('returns the default value for empty input', () => {
      expect(parseArray(undefined)).toEqual([]);
      expect(parseArray(null)).toEqual([]);
      expect(parseArray('')).toEqual([]);
      expect(parseArray(undefined, ['fallback'])).toEqual(['fallback']);
    });

    test('keeps empty segments', () => {
      expect(parseArray('a,,b')).toEqual(['a', '', 'b']);
    });
  });

  describe('randomString', () => {
    test('generates a string of the requested length', () => {
      expect(randomString(16)).toHaveLength(16);
      expect(randomString(1)).toHaveLength(1);
    });

    test('defaults to a length of 32', () => {
      expect(randomString()).toHaveLength(32);
    });

    test('uses only the enabled character categories', () => {
      expect(randomString(64, { numbers: true })).toMatch(/^\d+$/);
      expect(randomString(64, { lowercase: true })).toMatch(/^[a-z]+$/);
      expect(randomString(64, { uppercase: true })).toMatch(/^[A-Z]+$/);
      expect(randomString(64, { numbers: true, uppercase: true })).toMatch(
        /^[\dA-Z]+$/
      );
    });

    test('excludes a category that is explicitly disabled', () => {
      expect(randomString(128, { special: false, extra: false })).toMatch(
        /^[\da-zA-Z]+$/
      );
    });

    test('uses every category by default', () => {
      expect(randomString(256)).toMatch(
        /^[\da-zA-Z!#$%&()*+,\-./:;<=>?@[\]^_{|}~\\"'`]+$/
      );
    });

    test('produces different values on subsequent calls', () => {
      expect(randomString(32)).not.toBe(randomString(32));
    });
  });

  describe('generateToken', () => {
    test('generates a base62 token by default', () => {
      const token = generateToken();
      expect(token).toMatch(/^[\da-zA-Z]+$/);
      expect(token.length).toBeGreaterThan(0);
    });

    test('supports the uuidv4 method', () => {
      expect(generateToken('uuidv4')).toMatch(UUID_PATTERN);
    });

    test('supports the bytes method with the requested length', () => {
      expect(generateToken('bytes', 8)).toMatch(/^[\da-f]{8}$/);
      expect(generateToken('bytes', 32)).toMatch(/^[\da-f]{32}$/);
    });

    test('supports base32 tokens', () => {
      expect(generateToken('base32')).toMatch(/^[A-Z2-7-]+$/);
    });

    test('supports fixed length string tokens from a custom pool', () => {
      expect(generateToken('string', 12, undefined, { pool: 'ab' })).toMatch(
        /^[ab]{12}$/
      );
    });

    test('prefixes the token when a prefix is given', () => {
      expect(generateToken('base62', 8, 'key')).toMatch(/^key\.[\da-zA-Z]+$/);
    });

    test('produces different values on subsequent calls', () => {
      expect(generateToken()).not.toBe(generateToken());
    });
  });

  describe('uuid', () => {
    test('generates a v4 uuid', () => {
      expect(uuid()).toMatch(UUID_PATTERN);
    });

    test('generates unique values', () => {
      expect(uuid()).not.toBe(uuid());
    });
  });

  describe('plural / singular', () => {
    test('pluralizes regular and irregular nouns', () => {
      expect(plural('post')).toBe('posts');
      expect(plural('category')).toBe('categories');
      expect(plural('person')).toBe('people');
    });

    test('keeps an already plural noun plural', () => {
      expect(plural('posts')).toBe('posts');
    });

    test('singularizes regular and irregular nouns', () => {
      expect(singular('posts')).toBe('post');
      expect(singular('categories')).toBe('category');
      expect(singular('people')).toBe('person');
    });

    test('keeps an already singular noun singular', () => {
      expect(singular('post')).toBe('post');
    });
  });

  describe('capitalize / uncapitalize', () => {
    test('capitalizes the first character only', () => {
      expect(capitalize('post')).toBe('Post');
      expect(capitalize('postCategory')).toBe('PostCategory');
    });

    test('uncapitalizes the first character only', () => {
      expect(uncapitalize('Post')).toBe('post');
      expect(uncapitalize('PostCategory')).toBe('postCategory');
    });

    test('handles empty strings and non alphabetic first characters', () => {
      expect(capitalize('')).toBe('');
      expect(uncapitalize('')).toBe('');
      expect(capitalize('1abc')).toBe('1abc');
    });
  });

  describe('makeHash', () => {
    const content = 'appweaver';
    const sha256Hex = createHash('sha256').update(content).digest('hex');

    test('hashes a string with sha256/hex by default', () => {
      expect(makeHash(content)).toBe(sha256Hex);
      expect(makeHash(content)).toHaveLength(64);
    });

    test('hashes a buffer to the same value as the equivalent string', () => {
      expect(makeHash(Buffer.from(content, 'utf8'))).toBe(sha256Hex);
    });

    test('hashes a readable stream to the same value', async () => {
      const stream = Readable.from([
        Buffer.from('app', 'utf8'),
        Buffer.from('weaver', 'utf8')
      ]);
      await expect(makeHash(stream)).resolves.toBe(sha256Hex);
    });

    test('rejects when the stream emits an error', async () => {
      const stream = new Readable({
        read() {
          this.destroy(new Error('stream failure'));
        }
      });
      await expect(makeHash(stream)).rejects.toThrow('stream failure');
    });

    test('supports other algorithms', () => {
      expect(makeHash(content, 'sha512')).toBe(
        createHash('sha512').update(content).digest('hex')
      );
      expect(makeHash(content, 'sha512')).toHaveLength(128);
    });

    test('supports other encodings', () => {
      expect(makeHash(content, 'sha256', 'base64')).toBe(
        createHash('sha256').update(content).digest('base64')
      );
      expect(makeHash(content, 'sha256', 'base64url')).not.toContain('+');
    });

    test('is deterministic and differs for different content', () => {
      expect(makeHash('a')).toBe(makeHash('a'));
      expect(makeHash('a')).not.toBe(makeHash('b'));
    });
  });

  describe('makeUrlSlug', () => {
    test('joins values with a dash', () => {
      expect(makeUrlSlug('Hello', 'World')).toBe('hello-world');
    });

    test('lowercases and replaces whitespace', () => {
      expect(makeUrlSlug('My First Post')).toBe('my-first-post');
    });

    test('strips diacritics', () => {
      expect(makeUrlSlug('Čokoláda Šećer')).toBe('cokolada-secer');
    });

    test('removes special characters', () => {
      expect(makeUrlSlug('Hello, World! #1')).toBe('hello-world-1');
    });

    test('trims surrounding whitespace', () => {
      expect(makeUrlSlug('  spaced  ')).toBe('spaced');
    });

    test('returns an empty string for no values', () => {
      expect(makeUrlSlug()).toBe('');
    });
  });

  describe('camelToSnakeCase', () => {
    test('converts camelCase to snake_case', () => {
      expect(camelToSnakeCase('postCategory')).toBe('post_category');
      expect(camelToSnakeCase('createdAtDate')).toBe('created_at_date');
    });

    test('handles consecutive uppercase letters', () => {
      expect(camelToSnakeCase('parseHTTPResponse')).toBe('parse_http_response');
      expect(camelToSnakeCase('APIKey')).toBe('api_key');
    });

    test('handles digits', () => {
      expect(camelToSnakeCase('address1Line')).toBe('address1_line');
    });

    test('supports a custom divider', () => {
      expect(camelToSnakeCase('postCategory', '-')).toBe('post-category');
    });

    test('leaves an already lowercase string unchanged', () => {
      expect(camelToSnakeCase('post')).toBe('post');
      expect(camelToSnakeCase('')).toBe('');
    });
  });

  describe('snakeToCamelCase', () => {
    test('converts snake_case to camelCase', () => {
      expect(snakeToCamelCase('post_category')).toBe('postCategory');
      expect(snakeToCamelCase('created_at_date')).toBe('createdAtDate');
    });

    test('supports a custom divider', () => {
      expect(snakeToCamelCase('post-category', '-')).toBe('postCategory');
    });

    test('leaves a string without the divider unchanged', () => {
      expect(snakeToCamelCase('post')).toBe('post');
      expect(snakeToCamelCase('')).toBe('');
    });

    test('round trips with camelToSnakeCase', () => {
      expect(snakeToCamelCase(camelToSnakeCase('postCategoryName'))).toBe(
        'postCategoryName'
      );
    });
  });

  describe('errorMessage', () => {
    test('returns the message of an Error', () => {
      expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    test('returns the message of an Error subclass', () => {
      class CustomError extends Error {}
      expect(errorMessage(new CustomError('custom'))).toBe('custom');
    });

    test('stringifies non Error values', () => {
      expect(errorMessage('plain')).toBe('plain');
      expect(errorMessage(404)).toBe('404');
      expect(errorMessage(null)).toBe('null');
      expect(errorMessage(undefined)).toBe('undefined');
    });
  });

  describe('compareVersions', () => {
    test('returns 0 for equal versions', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    });

    test('returns a negative number when the first is lower', () => {
      expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
      expect(compareVersions('1.9.0', '2.0.0')).toBeLessThan(0);
    });

    test('returns a positive number when the first is higher', () => {
      expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
      expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    });

    test('treats missing segments as zero', () => {
      expect(compareVersions('1.2', '1.2.0')).toBe(0);
      expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0);
      expect(compareVersions('1', '1.0.1')).toBeLessThan(0);
    });

    test('sorts a list of versions', () => {
      const versions = ['1.10.0', '1.2.0', '2.0.0', '1.2.10'];
      expect(versions.sort(compareVersions)).toEqual([
        '1.2.0',
        '1.2.10',
        '1.10.0',
        '2.0.0'
      ]);
    });
  });

  describe('textToBytes', () => {
    test('parses plain byte values', () => {
      expect(textToBytes('1024')).toBe(1024);
      expect(textToBytes('0')).toBe(0);
    });

    test('parses kilobytes, megabytes, gigabytes and terabytes', () => {
      expect(textToBytes('1k')).toBe(1024);
      expect(textToBytes('1M')).toBe(1024 ** 2);
      expect(textToBytes('1G')).toBe(1024 ** 3);
      expect(textToBytes('1T')).toBe(1024 ** 4);
    });

    test('supports the B and iB unit suffixes', () => {
      expect(textToBytes('1KB')).toBe(1024);
      expect(textToBytes('1MiB')).toBe(1024 ** 2);
      expect(textToBytes('1 GB')).toBe(1024 ** 3);
    });

    test('parses fractional values and rounds the result', () => {
      expect(textToBytes('1.5 MB')).toBe(Math.round(1.5 * 1024 ** 2));
      expect(textToBytes('0.5k')).toBe(512);
    });

    test('is case insensitive and tolerates whitespace', () => {
      expect(textToBytes('2mb')).toBe(textToBytes('2 MB'));
    });

    test('defaults the numeric part to 1 when only a unit is given', () => {
      expect(textToBytes('MB')).toBe(1024 ** 2);
    });

    test('returns the default size for empty input', () => {
      expect(textToBytes()).toBe(0);
      expect(textToBytes('')).toBe(0);
      expect(textToBytes(undefined, 100)).toBe(100);
    });

    test('ignores unknown units', () => {
      expect(textToBytes('5xyz')).toBe(5);
    });

    test('falls back to a factor of 1 for an unparsable numeric part', () => {
      expect(textToBytes('.')).toBe(1);
      expect(textToBytes('.MB')).toBe(1024 ** 2);
    });
  });

  describe('replacePatternVariables', () => {
    test('returns the pattern unchanged when it has no variables', () => {
      expect(replacePatternVariables('static-name')).toBe('static-name');
    });

    test('replaces the current date variables', () => {
      const now = new Date();
      const result = replacePatternVariables('{year}/{month}/{day}');
      expect(result).toBe(
        `${now.getUTCFullYear()}/${now.getUTCMonth() + 1}/${now.getUTCDate()}`
      );
    });

    test('replaces the ISO week and day of year variables', () => {
      const now = new Date();
      expect(replacePatternVariables('{yearWeek}-{yearDay}')).toBe(
        `${getISOWeek(now)}-${getDayOfYear(now)}`
      );
    });

    test('replaces every occurrence of a variable', () => {
      const now = new Date();
      expect(replacePatternVariables('{year}-{year}')).toBe(
        `${now.getUTCFullYear()}-${now.getUTCFullYear()}`
      );
    });

    test('replaces the uuid and hash variables with generated values', () => {
      expect(replacePatternVariables('{uuid}')).toMatch(UUID_PATTERN);
      expect(replacePatternVariables('{hash}')).toMatch(/^[\da-f]{32}$/);
    });

    test('supports extra variables', () => {
      expect(
        replacePatternVariables('{name}-{id}.txt', { name: 'file', id: 7 })
      ).toBe('file-7.txt');
    });

    test('extra variables override the built in ones', () => {
      expect(replacePatternVariables('{year}', { year: 1999 })).toBe('1999');
    });

    test('leaves unknown variables in place', () => {
      expect(replacePatternVariables('{unknown}')).toBe('{unknown}');
    });
  });
});
