import { addHelpers } from '../../config/config-helper';
import { CONFIG_NAME } from '../../constants';

describe('config-helper', () => {
  describe('addHelpers', () => {
    test('returns the same object augmented with the helper functions', () => {
      const source: Record<string, any> = { APP_NAME: 'Appweaver' };
      const config = addHelpers(source);
      expect(config).toBe(source);
      expect(typeof config.env).toBe('function');
      expect(typeof config.str).toBe('function');
      expect(typeof config.int).toBe('function');
      expect(typeof config.float).toBe('function');
      expect(typeof config.bool).toBe('function');
      expect(typeof config.arr).toBe('function');
      expect(config.APP_NAME).toBe('Appweaver');
    });
  });

  describe('env', () => {
    const config = addHelpers({
      APP_NAME: 'Appweaver',
      EMPTY: '',
      LIST: ['a', 'b'],
      [`_${CONFIG_NAME}_CUSTOM_VALUE`]: 'custom'
    } as Record<string, any>);

    test('reads a known configuration key', () => {
      expect(config.env('APP_NAME')).toBe('Appweaver');
    });

    test('reads an unmapped key from the prefixed fallback', () => {
      expect(config.env('CUSTOM_VALUE')).toBe('custom');
    });

    test('joins array values with a comma', () => {
      expect(config.env('LIST')).toBe('a,b');
    });

    test('returns undefined for a missing key', () => {
      expect(config.env('MISSING')).toBeUndefined();
    });

    test('returns the default value for a missing key', () => {
      expect(config.env('MISSING', 'fallback')).toBe('fallback');
    });

    test('does not fall back for an empty string value', () => {
      expect(config.env('EMPTY', 'fallback')).toBe('');
    });
  });

  describe('str', () => {
    const config = addHelpers({ NAME: 'value' } as Record<string, any>);

    test('returns the string value', () => {
      expect(config.str('NAME')).toBe('value');
    });

    test('returns undefined or the default for a missing key', () => {
      expect(config.str('MISSING')).toBeUndefined();
      expect(config.str('MISSING', 'fallback')).toBe('fallback');
    });
  });

  describe('int', () => {
    const config = addHelpers({
      PORT: '5000',
      FLOATY: '1.9',
      INVALID: 'abc',
      NUMERIC: 42
    } as Record<string, any>);

    test('parses an integer value', () => {
      expect(config.int('PORT')).toBe(5000);
    });

    test('truncates a float value', () => {
      expect(config.int('FLOATY')).toBe(1);
    });

    test('returns the default for a non numeric value', () => {
      expect(config.int('INVALID', 10)).toBe(10);
      expect(config.int('INVALID')).toBeUndefined();
    });

    test('returns the default for a missing key', () => {
      expect(config.int('MISSING', 3000)).toBe(3000);
      expect(config.int('MISSING')).toBeUndefined();
    });

    test('parses a value that is already a number', () => {
      expect(config.int('NUMERIC')).toBe(42);
    });
  });

  describe('float', () => {
    const config = addHelpers({
      RATIO: '1.5',
      INVALID: 'abc'
    } as Record<string, any>);

    test('parses a float value', () => {
      expect(config.float('RATIO')).toBe(1.5);
    });

    test('returns the default for a non numeric value', () => {
      expect(config.float('INVALID', 0.5)).toBe(0.5);
      expect(config.float('INVALID')).toBeUndefined();
    });

    test('returns the default for a missing key', () => {
      expect(config.float('MISSING', 2.5)).toBe(2.5);
      expect(config.float('MISSING')).toBeUndefined();
    });
  });

  describe('bool', () => {
    const config = addHelpers({
      TRUE: 'true',
      UPPER: 'TRUE',
      ON: 'on',
      YES: ' yes ',
      ONE: '1',
      FALSE: 'false',
      ZERO: '0',
      OTHER: 'maybe'
    } as Record<string, any>);

    test('accepts every truthy representation', () => {
      expect(config.bool('TRUE')).toBe(true);
      expect(config.bool('UPPER')).toBe(true);
      expect(config.bool('ON')).toBe(true);
      expect(config.bool('YES')).toBe(true);
      expect(config.bool('ONE')).toBe(true);
    });

    test('treats anything else as false', () => {
      expect(config.bool('FALSE')).toBe(false);
      expect(config.bool('ZERO')).toBe(false);
      expect(config.bool('OTHER')).toBe(false);
    });

    test('returns the default for a missing key', () => {
      expect(config.bool('MISSING', true)).toBe(true);
      expect(config.bool('MISSING')).toBeUndefined();
    });
  });

  describe('arr', () => {
    const config = addHelpers({
      LIST: ['a', 'b'],
      SINGLE: 'only',
      [`_${CONFIG_NAME}_CSV`]: 'a, b ,c',
      [`_${CONFIG_NAME}_NUMBERS`]: '1,2,3',
      [`_${CONFIG_NAME}_FLAGS`]: 'true,0,yes',
      [`_${CONFIG_NAME}_MIXED`]: '1,abc'
    } as Record<string, any>);

    test('returns an array value as is', () => {
      expect(config.arr('LIST')).toEqual(['a', 'b']);
    });

    test('wraps a scalar configuration value into an array', () => {
      expect(config.arr('SINGLE')).toEqual(['only']);
    });

    test('splits a comma separated value and trims the entries', () => {
      expect(config.arr('CSV')).toEqual(['a', 'b', 'c']);
    });

    test('converts the entries to numbers based on the default value type', () => {
      expect(config.arr('NUMBERS', [0])).toEqual([1, 2, 3]);
    });

    test('keeps non numeric entries as strings', () => {
      expect(config.arr('MIXED', [0])).toEqual([1, 'abc']);
    });

    test('converts the entries to booleans based on the default value type', () => {
      expect(config.arr('FLAGS', [false])).toEqual([true, false, true]);
    });

    test('returns strings when no default value is given', () => {
      expect(config.arr('NUMBERS')).toEqual(['1', '2', '3']);
    });

    test('returns the default for a missing key', () => {
      expect(config.arr('MISSING')).toBeUndefined();
      expect(config.arr('MISSING', ['x'])).toEqual(['x']);
    });
  });
});
