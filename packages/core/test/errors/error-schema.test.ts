import { ErrorCode } from '@appweaver/common';
import { PROBLEM_CONTENT_TYPE } from '../../errors/error-handler';
import { defineErrors } from '../../errors/error-http-map';
import {
  documentErrorResponses,
  ERROR_CODES_EXTENSION,
  errorResponses,
  mergeErrorResponses,
  ERROR_RESPONSES_KEY,
  problemDetailsSchema,
  stashErrorResponses
} from '../../errors/error-schema';

/** Returns the codes by their status an error response lists. */
const codesOf = (response: any): Record<string, string[]> =>
  response[ERROR_CODES_EXTENSION];

/** Returns the codes a documented response narrows its problem details to. */
const narrowedCodes = (response: any): string[] =>
  response.content[PROBLEM_CONTENT_TYPE].schema.allOf[1].properties.code.enum;

describe('error-schema', () => {
  describe('errorResponses', () => {
    test('lists the codes by their status with the default ones', () => {
      const responses = errorResponses(
        ErrorCode.ResourceNotFound,
        ErrorCode.ResourceInvalidSort,
        ErrorCode.DatabaseUnavailable
      );

      expect(Object.keys(responses)).toEqual(['4xx', '5xx']);
      expect(codesOf(responses['4xx'])).toEqual({
        400: [
          ErrorCode.MalformedRequest,
          ErrorCode.ResourceInvalidSort,
          ErrorCode.ValidationFailed
        ],
        404: [ErrorCode.ResourceNotFound],
        429: [ErrorCode.RateLimited]
      });
      expect(codesOf(responses['5xx'])).toEqual({
        500: [ErrorCode.InternalError],
        503: [ErrorCode.DatabaseUnavailable]
      });
    });

    test('references the problem details schema', () => {
      const responses = errorResponses();

      expect(responses['4xx'].content[PROBLEM_CONTENT_TYPE].schema).toEqual(
        expect.objectContaining({ $ref: 'ProblemDetails' })
      );
    });

    test('includes the registered application codes', () => {
      const { SchemaTestDeclined } = defineErrors({
        SchemaTestDeclined: { status: 402, title: 'Declined' }
      });

      expect(codesOf(errorResponses(SchemaTestDeclined)['4xx'])[402]).toEqual([
        'SCHEMA_TEST_DECLINED'
      ]);
    });

    test('rejects an unregistered code', () => {
      expect(() => errorResponses('SCHEMA_TEST_UNKNOWN')).toThrow(
        "Error code 'SCHEMA_TEST_UNKNOWN' is not registered with defineErrors"
      );
    });
  });

  describe('mergeErrorResponses', () => {
    test('joins the codes of the error responses', () => {
      const merged = mergeErrorResponses(
        {
          200: { type: 'object' },
          ...errorResponses(ErrorCode.ResourceNotFound)
        },
        errorResponses(ErrorCode.FileNotFound, ErrorCode.AuthUnauthorized)
      );

      expect(merged[200]).toEqual({ type: 'object' });
      expect(codesOf(merged['4xx'])).toMatchObject({
        401: [ErrorCode.AuthUnauthorized],
        404: [ErrorCode.FileNotFound, ErrorCode.ResourceNotFound]
      });
    });

    test('keeps a response the route declares in another form', () => {
      const custom = { description: 'Custom client error' };

      const merged = mergeErrorResponses(
        { '4xx': custom },
        errorResponses(ErrorCode.ResourceNotFound)
      );

      expect(merged['4xx']).toBe(custom);
    });
  });

  describe('documentErrorResponses', () => {
    test('documents a response per status narrowing the codes', () => {
      const documented: any = documentErrorResponses({
        200: { type: 'object' },
        ...errorResponses(ErrorCode.ResourceNotFound)
      });

      expect(Object.keys(documented).sort()).toEqual([
        '200',
        '400',
        '404',
        '429',
        '500'
      ]);
      expect(documented[404].description).toBe('Not Found');
      expect(narrowedCodes(documented[404])).toEqual([
        ErrorCode.ResourceNotFound
      ]);
      expect(
        documented[404].content[PROBLEM_CONTENT_TYPE].schema.allOf[0]
      ).toEqual(expect.objectContaining({ $ref: 'ProblemDetails' }));
    });

    test('keeps the response a route declares for a status', () => {
      const health = { description: 'Unhealthy' };

      const documented: any = documentErrorResponses({
        503: health,
        ...errorResponses(ErrorCode.DatabaseUnavailable)
      });

      expect(documented[503]).toBe(health);
      expect(narrowedCodes(documented[500])).toEqual([ErrorCode.InternalError]);
    });
  });

  describe('problemDetailsSchema', () => {
    test('holds the framework and the registered application codes', () => {
      defineErrors({ SchemaTestListed: { status: 409, title: 'Listed' } });

      expect((problemDetailsSchema().properties.code as any).enum).toEqual(
        expect.arrayContaining([ErrorCode.InternalError, 'SCHEMA_TEST_LISTED'])
      );
    });
  });

  describe('stashErrorResponses', () => {
    test('moves the error responses out of the route responses', () => {
      const ok = { type: 'object' };
      const errors = errorResponses(ErrorCode.ResourceNotFound);
      const route: any = { schema: { response: { 200: ok, ...errors } } };

      stashErrorResponses(route);

      expect(route.schema.response).toEqual({ 200: ok });
      expect(route.schema[ERROR_RESPONSES_KEY]).toEqual(errors);
    });

    test('keeps the stash when the route schema is seen again', () => {
      const route: any = {
        schema: { response: { ...errorResponses(ErrorCode.ResourceNotFound) } }
      };

      stashErrorResponses(route);
      stashErrorResponses(route);

      expect(Object.keys(route.schema[ERROR_RESPONSES_KEY])).toEqual([
        '4xx',
        '5xx'
      ]);
    });

    test('leaves a route without error responses as it is', () => {
      const route: any = { schema: { response: { 200: { type: 'object' } } } };

      stashErrorResponses(route);

      expect(route.schema).toEqual({ response: { 200: { type: 'object' } } });
    });
  });
});
