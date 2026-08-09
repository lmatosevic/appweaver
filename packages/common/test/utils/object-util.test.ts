import {
  objectHasProperty,
  omitProperties,
  pickProperties,
  removeUndefined,
  setProperties,
  setValue
} from '../../utils/object-util';

describe('object-util', () => {
  describe('setValue', () => {
    test('sets a top level value', () => {
      const obj: Record<string, any> = {};
      const result = setValue(obj, 'name', 'test');
      expect(result).toBe(obj);
      expect(obj).toEqual({ name: 'test' });
    });

    test('creates the intermediate objects for a nested path', () => {
      const obj: Record<string, any> = {};
      setValue(obj, 'a.b.c', 42);
      expect(obj).toEqual({ a: { b: { c: 42 } } });
    });

    test('overwrites an existing leaf value', () => {
      const obj: Record<string, any> = { a: { b: 1 } };
      setValue(obj, 'a.b', 2);
      expect(obj).toEqual({ a: { b: 2 } });
    });

    test('merges into an existing intermediate branch', () => {
      const obj: Record<string, any> = { a: { keep: true } };
      setValue(obj, 'a.b', 1);
      expect(obj).toEqual({ a: { keep: true, b: 1 } });
    });

    test('replaces an intermediate value that is not an object', () => {
      const obj: Record<string, any> = { a: 1 };
      setValue(obj, 'a.b', 2);
      expect(obj).toEqual({ a: { b: 2 } });
    });

    test('supports any value type', () => {
      const obj: Record<string, any> = {};
      setValue(obj, 'list', [1, 2]);
      setValue(obj, 'nothing', undefined);
      expect(obj.list).toEqual([1, 2]);
      expect('nothing' in obj).toBe(true);
      expect(obj.nothing).toBeUndefined();
    });
  });

  describe('setProperties', () => {
    test('assigns the same value to every property', () => {
      expect(setProperties({ a: 1, b: 2 } as any, 0 as any)).toEqual({
        a: 0,
        b: 0
      });
    });

    test('supports undefined as the assigned value', () => {
      const result = setProperties({ a: 1, b: 2 } as any, undefined);
      expect(result).toEqual({ a: undefined, b: undefined });
      expect(Object.keys(result)).toEqual(['a', 'b']);
    });

    test('returns a new object', () => {
      const source = { a: 1 };
      const result = setProperties(source as any, undefined);
      expect(result).not.toBe(source);
      expect(source).toEqual({ a: 1 });
    });

    test('returns an empty object for an empty source', () => {
      expect(setProperties({}, undefined)).toEqual({});
    });
  });

  describe('pickProperties', () => {
    test('picks only the requested properties', () => {
      expect(pickProperties({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({
        a: 1,
        c: 3
      });
    });

    test('ignores properties that do not exist', () => {
      expect(pickProperties({ a: 1 } as any, ['a', 'missing'])).toEqual({
        a: 1
      });
    });

    test('keeps properties holding an undefined value', () => {
      const result = pickProperties({ a: undefined, b: 1 }, ['a']);
      expect('a' in result).toBe(true);
      expect(result.a).toBeUndefined();
    });

    test('returns an empty object when nothing is picked', () => {
      expect(pickProperties({ a: 1 }, [])).toEqual({});
    });

    test('does not mutate the source object', () => {
      const source = { a: 1, b: 2 };
      pickProperties(source, ['a']);
      expect(source).toEqual({ a: 1, b: 2 });
    });
  });

  describe('omitProperties', () => {
    test('omits the requested properties', () => {
      expect(omitProperties({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({
        a: 1,
        c: 3
      });
    });

    test('returns all properties when nothing is omitted', () => {
      expect(omitProperties({ a: 1, b: 2 }, [])).toEqual({ a: 1, b: 2 });
    });

    test('returns an empty object when everything is omitted', () => {
      expect(omitProperties({ a: 1, b: 2 }, ['a', 'b'])).toEqual({});
    });

    test('does not mutate the source object', () => {
      const source = { a: 1, b: 2 };
      omitProperties(source, ['a']);
      expect(source).toEqual({ a: 1, b: 2 });
    });
  });

  describe('removeUndefined', () => {
    test('removes properties with an undefined value', () => {
      expect(removeUndefined({ a: 1, b: undefined, c: 'x' })).toEqual({
        a: 1,
        c: 'x'
      });
    });

    test('keeps null, zero, empty string and false values', () => {
      expect(
        removeUndefined({ a: null, b: 0, c: '', d: false, e: undefined })
      ).toEqual({ a: null, b: 0, c: '', d: false });
    });

    test('returns an empty object when all values are undefined', () => {
      expect(removeUndefined({ a: undefined })).toEqual({});
    });

    test('does not mutate the source object', () => {
      const source = { a: 1, b: undefined };
      removeUndefined(source);
      expect('b' in source).toBe(true);
    });
  });

  describe('objectHasProperty', () => {
    test('finds a top level property with a matching value', () => {
      expect(objectHasProperty({ type: 'string' }, 'type', 'string')).toBe(
        true
      );
    });

    test('returns false when the key matches but the value does not', () => {
      expect(objectHasProperty({ type: 'string' }, 'type', 'int')).toBe(false);
    });

    test('returns false when the key is missing', () => {
      expect(objectHasProperty({ other: 1 }, 'type', 1)).toBe(false);
    });

    test('finds a property nested in a child object', () => {
      const data = { a: { b: { format: 'binary' } } };
      expect(objectHasProperty(data, 'format', 'binary')).toBe(true);
    });

    test('finds a property nested in an array', () => {
      const data = [{ a: 1 }, { b: { c: 'found' } }];
      expect(objectHasProperty(data as any, 'c', 'found')).toBe(true);
      expect(objectHasProperty(data as any, 'c', 'other')).toBe(false);
    });

    test('finds a property inside an array nested in an object', () => {
      const data = { items: [{ id: 5 }] };
      expect(objectHasProperty(data, 'id', 5)).toBe(true);
    });

    test('returns false for an empty object or array', () => {
      expect(objectHasProperty({}, 'a', 1)).toBe(false);
      expect(objectHasProperty([] as any, 'a', 1)).toBe(false);
    });

    test('matches by strict equality', () => {
      expect(objectHasProperty({ a: 1 }, 'a', '1')).toBe(false);
      expect(objectHasProperty({ a: null }, 'a', null)).toBe(true);
    });

    test('returns false for nullish data', () => {
      expect(objectHasProperty(null as any, 'a', 1)).toBe(false);
      expect(objectHasProperty(undefined as any, 'a', 1)).toBe(false);
    });

    test('handles null valued properties without throwing', () => {
      expect(objectHasProperty({ a: null, b: 2 }, 'b', 2)).toBe(true);
    });
  });
});
