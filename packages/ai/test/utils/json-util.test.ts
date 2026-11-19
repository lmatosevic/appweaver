import { Type } from '@sinclair/typebox';
import { parseJsonOutput, parsePartialJson, schemaErrors } from '../../index';

describe('json-util', () => {
  describe('parseJsonOutput', () => {
    test.each([
      ['{"a":1}', { a: 1 }],
      ['```json\n{"a":1}\n```', { a: 1 }],
      ['```\n[1,2]\n```', [1, 2]],
      ['Here you go: {"a":{"b":[1]}} enjoy', { a: { b: [1] } }]
    ])('parses %s', (text, value) => {
      expect(parseJsonOutput(text)).toEqual(value);
    });

    test('rejects a text without JSON', () => {
      expect(() => parseJsonOutput('no json')).toThrow(SyntaxError);
    });
  });

  describe('parsePartialJson', () => {
    test.each([
      ['', undefined],
      ['Sure', undefined],
      ['{', {}],
      ['{"name": "Zag', { name: 'Zag' }],
      ['{"name": "a\\', { name: 'a' }],
      ['{"a": 1, "b', { a: 1 }],
      ['{"a": 1,', { a: 1 }],
      ['{"items": ["x", "y', { items: ['x', 'y'] }],
      ['{"a": {"b": tr', { a: {} }],
      ['[{"a": 1}, {"b": "}"', [{ a: 1 }, { b: '}' }]],
      ['{"done": true}', { done: true }]
    ])('parses %j', (text, value) => {
      expect(parsePartialJson(text)).toEqual(value);
    });

    test('gives up on a prefix that never completes', () => {
      expect(parsePartialJson(`{"a": ${'x'.repeat(100)}`)).toBeUndefined();
    });
  });

  describe('schemaErrors', () => {
    test('lists up to ten errors with their paths', () => {
      const schema = Type.Object({ n: Type.Integer() });

      expect(schemaErrors(schema, { n: 'x' })).toEqual([
        '/n: Expected integer'
      ]);
      expect(schemaErrors(Type.Integer(), 'x')).toEqual([
        '/: Expected integer'
      ]);
      expect(
        schemaErrors(Type.Array(Type.Integer()), Array(20).fill('x'))
      ).toHaveLength(10);
      expect(schemaErrors(schema, { n: 1 })).toEqual([]);
    });
  });
});
