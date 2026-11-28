import { parseEnvArray } from '../../config/env-array';
import { ConfigurationError } from '../../errors';

describe('env-array', () => {
  describe('parseEnvArray', () => {
    test('splits a comma-separated list, trimming the items', () => {
      expect(parseEnvArray('KEY', 'a, b ,c')).toEqual(['a', 'b', 'c']);
    });

    test('reads a JSON array, whose items may hold commas', () => {
      expect(parseEnvArray('KEY', ' ["a,b", "c"] ')).toEqual(['a,b', 'c']);
      expect(parseEnvArray('KEY', '[1, 2]')).toEqual([1, 2]);
    });

    test('returns the default of an empty value', () => {
      expect(parseEnvArray('KEY', '  ', ['x'])).toEqual(['x']);
      expect(parseEnvArray('KEY', '')).toEqual([]);
    });

    test.each([
      ['["a", "b"', 'a JSON array that does not parse'],
      ['[', 'a JSON array that does not parse'],
      ['a,,b', 'an empty item'],
      ['a,', 'an empty item'],
      ['"a","b"', 'a quoted item'],
      ["'a'", 'a quoted item']
    ])('rejects the ambiguous value %s', (value, reason) => {
      expect(() => parseEnvArray('SERVER_CORS_ORIGIN', value)).toThrow(
        ConfigurationError
      );
      expect(() => parseEnvArray('SERVER_CORS_ORIGIN', value)).toThrow(
        `SERVER_CORS_ORIGIN is ${reason}`
      );
    });

    test('names the key in the details of the error', () => {
      const error = (() => {
        try {
          parseEnvArray('KEY', 'a,,b');
        } catch (thrown) {
          return thrown as ConfigurationError;
        }
      })();

      expect(error?.details).toEqual({
        errors: ['KEY: an empty item of the comma-separated list']
      });
    });
  });
});
