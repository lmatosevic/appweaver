import { Type } from '@sinclair/typebox';
import { toJsonSchema } from '../../utils/schema-util';

describe('schema-util', () => {
  describe('toJsonSchema', () => {
    test('inlines the references of the $defs, without the TypeBox keywords', () => {
      const schema = {
        $ref: 'Book',
        $defs: {
          Book: {
            $id: 'Book',
            type: 'object',
            properties: {
              title: { type: 'string', example: 'Dune' },
              pages: { type: 'integer', nullable: true },
              author: { $ref: '#/$defs/Author', description: 'The author' }
            }
          },
          Author: {
            $id: 'Author',
            type: 'object',
            properties: { name: { type: 'string' } }
          }
        }
      };

      expect(toJsonSchema(schema as never)).toEqual({
        type: 'object',
        properties: {
          title: { type: 'string' },
          pages: { type: ['integer', 'null'] },
          author: {
            type: 'object',
            properties: { name: { type: 'string' } },
            description: 'The author'
          }
        }
      });
    });

    test('leaves an unknown or a cyclic reference open', () => {
      const cyclic = {
        $ref: 'Node',
        $defs: {
          Node: {
            type: 'object',
            properties: { next: { $ref: 'Node' } }
          }
        }
      };

      expect(toJsonSchema({ $ref: 'Missing' } as never)).toEqual({});
      expect(
        JSON.stringify(toJsonSchema(cyclic as never)).match(/next/g)
      ).toHaveLength(4);
    });

    test('keeps a plain schema', () => {
      expect(toJsonSchema(Type.Array(Type.Integer()))).toEqual({
        type: 'array',
        items: { type: 'integer' }
      });
    });
  });
});
