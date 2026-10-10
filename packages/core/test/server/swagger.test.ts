import { ErrorCode } from '@appweaver/common';
import { defineErrors } from '../../errors';
import {
  hoistErrorResponses,
  nameErrorCodes,
  pruneUnusedSchemas,
  REQUEST_EXTENSION
} from '../../server/swagger';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Wraps the paths and schemas the way the Swagger plugin hands them over. */
const document = (paths: any, schemas: Record<string, any>) => ({
  openapiObject: { paths, components: { schemas } }
});

describe('swagger', () => {
  describe('nameErrorCodes', () => {
    test('names the error codes of the problem details schema', () => {
      defineErrors({ SwaggerTestNamed: { status: 409, title: 'Named' } });
      const code = {
        type: 'string',
        enum: [ErrorCode.OAuth2ProviderError, 'SWAGGER_TEST_NAMED', 'OTHER']
      };

      nameErrorCodes({
        components: {
          schemas: {
            'def-0': { title: 'ProblemDetails', properties: { code } }
          }
        }
      });

      expect(code).toEqual(
        expect.objectContaining({
          'x-enum-varnames': [
            'OAuth2ProviderError',
            'SwaggerTestNamed',
            'OTHER'
          ]
        })
      );
    });
  });

  describe('hoistErrorResponses', () => {
    /** An error response the way the document holds it. */
    const problem = (codes: string[]) => ({
      description: 'Error',
      content: {
        'application/problem+json': {
          schema: {
            allOf: [ref('def-0'), { properties: { code: { enum: codes } } }]
          }
        }
      }
    });

    test('shares the error responses of the same status and codes', () => {
      const doc: any = {
        paths: {
          '/posts/{id}': {
            get: {
              responses: {
                200: ref('def-1'),
                404: problem([ErrorCode.ResourceNotFound])
              }
            },
            delete: {
              responses: {
                404: problem([
                  ErrorCode.FileNotFound,
                  ErrorCode.ResourceNotFound
                ])
              }
            }
          },
          '/tags/{id}': {
            get: { responses: { 404: problem([ErrorCode.ResourceNotFound]) } }
          }
        }
      };

      hoistErrorResponses(doc);

      expect(doc.paths['/posts/{id}'].get.responses).toEqual({
        200: ref('def-1'),
        404: { $ref: '#/components/responses/ResourceNotFoundError' }
      });
      expect(doc.paths['/tags/{id}'].get.responses[404]).toEqual({
        $ref: '#/components/responses/ResourceNotFoundError'
      });
      expect(doc.paths['/posts/{id}'].delete.responses[404].$ref).toMatch(
        /^#\/components\/responses\/NotFoundError_[0-9a-f]{6}$/
      );
      expect(Object.keys(doc.components.responses)).toHaveLength(2);
    });

    test('names a response by its own codes only', () => {
      const codes = [
        ErrorCode.InternalError,
        ErrorCode.DatabaseOperationFailed
      ];
      const name = (extra: string[]) => {
        const doc: any = {
          paths: Object.fromEntries(
            [codes, ...extra.map((code) => [code])].map((set, i) => [
              `/p${i}`,
              { get: { responses: { 500: problem(set) } } }
            ])
          )
        };
        hoistErrorResponses(doc);
        return doc.paths['/p0'].get.responses[500].$ref;
      };

      expect(name([])).toBe(name([ErrorCode.ExportFailed]));
      expect(name([])).toMatch(/InternalServerError_[0-9a-f]{6}$/);
    });

    test('keeps a single Error suffix', () => {
      const doc: any = {
        paths: {
          '/a': {
            get: { responses: { 500: problem([ErrorCode.InternalError]) } }
          }
        }
      };

      hoistErrorResponses(doc);

      expect(Object.keys(doc.components.responses)).toEqual(['InternalError']);
    });
  });

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
