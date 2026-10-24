const mockBuildSerializer = jest.fn();

jest.mock('@fastify/fast-json-stringify-compiler', () => {
  const actual = jest.requireActual('@fastify/fast-json-stringify-compiler');
  return {
    ...actual,
    SerializerSelector: () => {
      const build = actual.SerializerSelector();
      return (externalSchemas: unknown, options: unknown) => {
        mockBuildSerializer(externalSchemas);
        return build(externalSchemas, options);
      };
    }
  };
});

import { referencedSerializer } from '../../server/response-serialization';

const route = (schema: unknown) => ({
  schema,
  method: 'GET',
  url: '/',
  httpStatus: '200'
});

const schemas = {
  Item: {
    $id: 'Item',
    type: 'object',
    properties: { name: { type: 'string' }, tag: { $ref: 'Tag#' } }
  },
  Tag: {
    $id: 'Tag',
    type: 'object',
    properties: { label: { type: 'string' } }
  },
  Other: {
    $id: 'Other',
    type: 'object',
    properties: { value: { type: 'number' } }
  }
};

describe('response-serialization', () => {
  describe('referencedSerializer', () => {
    beforeEach(() => mockBuildSerializer.mockClear());

    test('passes only the transitively referenced schemas', () => {
      const serialize = referencedSerializer()(schemas, {})(
        route({ type: 'array', items: { $ref: 'Item' } })
      );

      expect(Object.keys(mockBuildSerializer.mock.calls[0][0]).sort()).toEqual([
        'Item',
        'Tag'
      ]);
      expect(
        serialize([{ name: 'a', tag: { label: 'b', extra: 1 }, extra: 2 }])
      ).toBe('[{"name":"a","tag":{"label":"b"}}]');
    });

    test('passes no schemas to a schema without references', () => {
      const serialize = referencedSerializer()(schemas, {})(
        route({ type: 'object', properties: { id: { type: 'integer' } } })
      );

      expect(mockBuildSerializer.mock.calls[0][0]).toEqual({});
      expect(serialize({ id: 1, extra: 2 })).toBe('{"id":1}');
    });

    test('passes every schema when a reference names no shared schema', () => {
      const nested = {
        ...schemas,
        Wrapper: {
          $id: 'Wrapper',
          type: 'object',
          properties: {
            inner: { $id: 'Inner', type: 'object', properties: {} }
          }
        }
      };

      referencedSerializer()(nested, {})(route({ $ref: 'Inner' }));

      expect(mockBuildSerializer.mock.calls[0][0]).toBe(nested);
    });
  });
});
