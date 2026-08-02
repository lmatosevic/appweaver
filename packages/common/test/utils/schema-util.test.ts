import { Kind, OptionalKind, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  AnyJson,
  DateType,
  EnumType,
  Nullable,
  NullType,
  StringDate,
  StringEnum
} from '../../utils/schema-util';

describe('schema-util', () => {
  describe('StringEnum', () => {
    test('builds a string schema with the object values as the enum', () => {
      const schema = StringEnum({ Draft: 'draft', Published: 'published' });
      expect(schema.type).toBe('string');
      expect(schema['enum']).toEqual(['draft', 'published']);
      expect(schema[Kind]).toBe('String');
    });

    test('supports a real enum as the source', () => {
      enum Status {
        On = 'on',
        Off = 'off'
      }
      expect(StringEnum(Status)['enum']).toEqual(['on', 'off']);
    });

    test('merges additional string options', () => {
      const schema = StringEnum(
        { A: 'a' },
        { description: 'status', default: 'a' }
      );
      expect(schema['description']).toBe('status');
      expect(schema['default']).toBe('a');
    });

    test('produces an empty enum for an empty object', () => {
      expect(StringEnum({})['enum']).toEqual([]);
    });
  });

  describe('StringDate', () => {
    test('builds a date-time formatted string schema', () => {
      const schema = StringDate();
      expect(schema.type).toBe('string');
      expect(schema['format']).toBe('date-time');
      expect(schema[Kind]).toBe('String');
      expect(schema['example']).toBeDefined();
    });

    test('allows overriding the defaults', () => {
      const schema = StringDate({ example: '2020-01-01T00:00:00.000Z' });
      expect(schema['example']).toBe('2020-01-01T00:00:00.000Z');
    });
  });

  describe('AnyJson', () => {
    test('accepts any value', () => {
      const schema = AnyJson();
      expect(Value.Check(schema, { a: 1 })).toBe(true);
      expect(Value.Check(schema, [1, 2])).toBe(true);
      expect(Value.Check(schema, 'text')).toBe(true);
      expect(Value.Check(schema, null)).toBe(true);
    });

    test('uses an empty object as the default example', () => {
      expect(AnyJson()['example']).toEqual({});
    });

    test('allows overriding the example', () => {
      expect(AnyJson({ example: { key: 'value' } })['example']).toEqual({
        key: 'value'
      });
    });
  });

  describe('Nullable', () => {
    test('marks a plain schema as optional and nullable', () => {
      const schema = Nullable(Type.String());
      expect(schema[OptionalKind]).toBe('Optional');
      expect(schema['nullable']).toBe(true);
      expect(schema['type']).toBe('string');
    });

    test('keeps the original schema options', () => {
      const schema = Nullable(Type.String({ maxLength: 10 }));
      expect(schema['maxLength']).toBe(10);
    });

    test('builds a union for a union schema', () => {
      const schema = Nullable(Type.Union([Type.String(), Type.Number()]));
      expect(schema['anyOf']).toHaveLength(2);
      expect(Value.Check(schema, null)).toBe(true);
      expect(Value.Check(schema, 'text')).toBe(true);
    });

    test('builds a union for an any schema', () => {
      const schema = Nullable(Type.Any());
      expect(schema['anyOf']).toBeDefined();
    });

    test('builds a union for a ref schema', () => {
      const schema = Nullable(Type.Ref('User'));
      expect(schema['anyOf']).toBeDefined();
    });

    test('does not mutate the wrapped schema', () => {
      const inner = Type.String();
      Nullable(inner);
      expect(inner['nullable']).toBeUndefined();
    });
  });

  describe('EnumType', () => {
    test('builds an enum accepting the given values', () => {
      const schema = EnumType(['draft', 'published']);
      expect(Value.Check(schema, 'draft')).toBe(true);
      expect(Value.Check(schema, 'published')).toBe(true);
      expect(Value.Check(schema, 'archived')).toBe(false);
    });

    test('accepts nothing when no values are given', () => {
      expect(Value.Check(EnumType(), 'anything')).toBe(false);
      expect(Value.Check(EnumType([]), 'anything')).toBe(false);
    });
  });

  describe('DateType', () => {
    test('builds a date schema with the date-time format by default', () => {
      const schema = DateType();
      expect(schema['format']).toBe('date-time');
      expect(Value.Check(schema, new Date())).toBe(true);
    });

    test('allows overriding the format', () => {
      expect(DateType({ format: 'date' })['format']).toBe('date');
    });

    test('keeps additional options', () => {
      expect(DateType({ description: 'created' })['description']).toBe(
        'created'
      );
    });
  });

  describe('NullType', () => {
    test('accepts the wrapped type and null', () => {
      const schema = NullType(Type.String());
      expect(Value.Check(schema, 'text')).toBe(true);
      expect(Value.Check(schema, null)).toBe(true);
      expect(Value.Check(schema, 1)).toBe(false);
    });

    test('is optional', () => {
      expect(NullType(Type.String())[OptionalKind]).toBe('Optional');
    });

    test('works with object schemas', () => {
      const schema = NullType(Type.Object({ id: Type.String() }));
      expect(Value.Check(schema, { id: 'a' })).toBe(true);
      expect(Value.Check(schema, null)).toBe(true);
    });
  });
});
