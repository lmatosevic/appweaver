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

import { resourceModelProps } from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { createModel } from '@appweaver/data';
import { linkModels, resetContext } from '@appweaver/testing';
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

    test('leaves out the fields a relation omits from the response of a model', () => {
      resetContext();
      createModel({
        name: 'User',
        scalars: { name: { type: 'string' }, email: { type: 'string' } }
      });
      createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } },
        relations: {
          author: {
            model: 'User',
            type: 'one',
            required: false,
            output: { type: 'always', omit: ['email'] }
          }
        }
      } as never);
      linkModels();
      // Registered like the schemas plugin of the server does
      const models: Record<string, unknown> = {};
      for (const model of context.resource.models.values()) {
        for (const [suffix, property] of Object.entries(resourceModelProps)) {
          const name = `${model.name}${suffix}`;
          models[name] = (model as any)[property].$defs[name];
        }
      }
      const stamps = {
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      };
      const author = { id: 2, name: 'Ana', email: 'a@test.com', ...stamps };

      const post = referencedSerializer()(models, {})(
        route({ $ref: 'PostSingle' })
      )({ id: 1, title: 'Hello', author, ...stamps });
      const user = referencedSerializer()(models, {})(
        route({ $ref: 'UserSingle' })
      )(author);
      resetContext();

      expect(JSON.parse(post).author).toEqual({
        id: 2,
        name: 'Ana',
        ...stamps
      });
      expect(JSON.parse(user)).toEqual(author);
    });
  });
});
