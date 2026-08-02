import { arrayToString, stringToArray } from '../../utils/array-util';

describe('array-util', () => {
  describe('arrayToString', () => {
    test('serializes an array of primitives', () => {
      expect(arrayToString([1, 2, 3])).toBe('[1,2,3]');
      expect(arrayToString(['a', 'b'])).toBe('["a","b"]');
      expect(arrayToString([true, false])).toBe('[true,false]');
    });

    test('serializes an empty array', () => {
      expect(arrayToString([])).toBe('[]');
    });

    test('serializes an array of objects', () => {
      expect(arrayToString([{ a: 1 }, { b: 'x' }])).toBe('[{"a":1},{"b":"x"}]');
    });

    test('serializes nested arrays', () => {
      expect(arrayToString([[1, 2], [3]])).toBe('[[1,2],[3]]');
    });

    test('serializes null and undefined entries', () => {
      expect(arrayToString([null, undefined])).toBe('[null,null]');
    });
  });

  describe('stringToArray', () => {
    test('parses an array of primitives', () => {
      expect(stringToArray('[1,2,3]')).toEqual([1, 2, 3]);
      expect(stringToArray('["a","b"]')).toEqual(['a', 'b']);
    });

    test('parses an empty array', () => {
      expect(stringToArray('[]')).toEqual([]);
    });

    test('parses an array of objects', () => {
      expect(stringToArray('[{"a":1}]')).toEqual([{ a: 1 }]);
    });

    test('throws on invalid JSON', () => {
      expect(() => stringToArray('not json')).toThrow();
    });
  });

  describe('round trip', () => {
    test('stringToArray reverses arrayToString', () => {
      const value = [
        { id: 1, name: 'one' },
        { id: 2, name: 'two' }
      ];
      expect(stringToArray(arrayToString(value))).toEqual(value);
    });
  });
});
