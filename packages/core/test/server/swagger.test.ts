import { pruneUnusedSchemas, REQUEST_EXTENSION } from '../../server/swagger';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Wraps the paths and schemas the way the Swagger plugin hands them over. */
const document = (paths: any, schemas: Record<string, any>) => ({
  openapiObject: { paths, components: { schemas } }
});

describe('swagger', () => {
  describe('pruneUnusedSchemas', () => {
    test('keeps the schemas reachable from a path and drops the rest', () => {
      const result = pruneUnusedSchemas(
        document(
          { '/posts/{id}': { get: { responses: { 200: ref('def-0') } } } },
          {
            'def-0': {
              title: 'PostSingle',
              properties: { author: ref('def-1') }
            },
            'def-1': { title: 'UserSingle' },
            'def-2': { title: 'PostCreate' }
          }
        )
      );

      expect(Object.keys(result.components.schemas).sort()).toEqual([
        'def-0',
        'def-1'
      ]);
    });

    test('keeps the request model named by an operation and what it references', () => {
      const result = pruneUnusedSchemas(
        document(
          {
            '/posts/query': {
              get: { [REQUEST_EXTENSION]: 'PostQueryRequest', parameters: [] }
            }
          },
          {
            'def-0': {
              title: 'PostQueryRequest',
              properties: { filter: ref('def-1') }
            },
            'def-1': { title: 'PostQueryFilter' },
            'def-2': { title: 'PostAggregateRequest' }
          }
        )
      );

      expect(Object.keys(result.components.schemas).sort()).toEqual([
        'def-0',
        'def-1'
      ]);
    });

    test('ignores a request model the document does not hold', () => {
      const result = pruneUnusedSchemas(
        document(
          { '/posts/query': { get: { [REQUEST_EXTENSION]: 'Missing' } } },
          { 'def-0': { title: 'PostQueryRequest' } }
        )
      );

      expect(result.components.schemas).toEqual({});
    });
  });
});
