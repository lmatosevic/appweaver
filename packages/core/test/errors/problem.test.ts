import { ApplicationError, ErrorCode, RequestError } from '@appweaver/common';
import { defineErrors } from '../../errors/error-http-map';
import { errorType, toProblem } from '../../errors/problem';
import { ResourceError } from '../../resource/resource-error';

/** Creates an error shaped like the ones of Fastify and its plugins. */
const fastifyError = (props: Record<string, unknown>, message = 'failed') =>
  Object.assign(new Error(message), props);

/** Creates an error shaped like a known request error of the Prisma client. */
const prismaError = (
  code: string,
  meta: Record<string, unknown>,
  message = 'Prisma failed'
) =>
  Object.assign(new Error(message), {
    name: 'PrismaClientKnownRequestError',
    code,
    meta
  });

describe('problem', () => {
  describe('toProblem', () => {
    test('maps an error by its code into the problem details', () => {
      const error = new ResourceError(
        ErrorCode.ResourceNotFound,
        'Post not found',
        {
          model: 'Post',
          id: 1
        }
      );

      expect(
        toProblem(error, { url: '/api/posts/1?x=1', id: 'req-1' })
      ).toEqual({
        type: 'urn:appweaver:error:resource-not-found',
        title: 'Resource not found',
        status: 404,
        code: ErrorCode.ResourceNotFound,
        detail: 'Post not found',
        instance: '/api/posts/1',
        requestId: 'req-1',
        details: { model: 'Post', id: 1 }
      });
    });

    test('appends the cause message to the detail outside of production', () => {
      const error = new ResourceError(
        ErrorCode.ResourceInvalidCursor,
        'Invalid pagination cursor',
        {},
        { cause: new Error('bad base64') }
      );

      expect(toProblem(error).detail).toBe(
        'Invalid pagination cursor (bad base64)'
      );
    });

    test('maps an unknown error to an internal error', () => {
      const problem = toProblem(new Error('boom'));

      expect(problem).toMatchObject({
        status: 500,
        code: ErrorCode.InternalError,
        detail: 'Internal server error (boom)'
      });
      expect(problem.details).toBeUndefined();
    });

    test('maps a validation error with its invalid fields', () => {
      const error = fastifyError(
        {
          code: 'FST_ERR_VALIDATION',
          validationContext: 'body',
          validation: [
            {
              instancePath: '',
              keyword: 'required',
              params: { missingProperty: 'title' },
              message: "must have required property 'title'"
            },
            {
              instancePath: '/author/email',
              keyword: 'format',
              params: {},
              message: 'must match format "email"'
            }
          ]
        },
        'body must have required property title'
      );

      const problem = toProblem(error);

      expect(problem).toMatchObject({
        status: 400,
        code: ErrorCode.ValidationFailed,
        detail: 'body must have required property title',
        errors: [
          {
            field: 'title',
            rule: 'required',
            message: 'is required',
            pointer: '#/body/title'
          },
          {
            field: 'author.email',
            rule: 'format',
            message: 'must match format "email"',
            pointer: '#/body/author/email'
          }
        ]
      });
      expect(problem.details).toBeUndefined();
    });

    test('names the property a schema does not declare', () => {
      const error = fastifyError({
        code: 'FST_ERR_VALIDATION',
        validationContext: 'querystring',
        validation: [
          {
            instancePath: '/filter',
            keyword: 'additionalProperties',
            params: { additionalProperty: 'titel' },
            message: 'must NOT have additional properties'
          }
        ]
      });

      expect(toProblem(error).errors).toEqual([
        {
          field: 'filter.titel',
          rule: 'additionalProperties',
          message: 'is not allowed',
          pointer: '#/querystring/filter/titel'
        }
      ]);
    });

    test.each([
      ['FST_ERR_CTP_INVALID_JSON_BODY', 400, ErrorCode.MalformedRequest],
      ['FST_ERR_CTP_INVALID_MEDIA_TYPE', 415, ErrorCode.UnsupportedMediaType],
      ['FST_ERR_CTP_BODY_TOO_LARGE', 413, ErrorCode.PayloadTooLarge],
      ['FST_REQ_FILE_TOO_LARGE', 413, ErrorCode.FileTooLarge],
      ['FST_FILES_LIMIT', 400, ErrorCode.FileLimitExceeded],
      ['FST_ERR_NOT_FOUND', 404, ErrorCode.RouteNotFound]
    ])('maps the %s Fastify error', (code, status, errorCode) => {
      expect(toProblem(fastifyError({ code, statusCode: 400 }))).toMatchObject({
        status,
        code: errorCode
      });
    });

    test('maps the Basic auth header error by the proxy mode status', () => {
      const code = 'FST_BASIC_AUTH_MISSING_OR_BAD_AUTHORIZATION_HEADER';

      expect(toProblem(fastifyError({ code, statusCode: 401 })).code).toBe(
        ErrorCode.AuthInvalidHeader
      );
      expect(toProblem(fastifyError({ code, statusCode: 407 }))).toMatchObject({
        status: 407,
        code: ErrorCode.AuthProxyAuthenticationRequired
      });
    });

    test('maps a rate limit error', () => {
      expect(toProblem(fastifyError({ statusCode: 429 }))).toMatchObject({
        status: 429,
        code: ErrorCode.RateLimited
      });
    });

    test('keeps the client error status of an unknown framework error', () => {
      expect(
        toProblem(fastifyError({ statusCode: 418 }, 'teapot'))
      ).toMatchObject({
        status: 418,
        code: ErrorCode.RequestFailed,
        detail: 'teapot'
      });
    });

    test('translates a database constraint violation into field errors', () => {
      const error = prismaError('P2002', {
        modelName: 'User',
        driverAdapterError: {
          cause: {
            kind: 'UniqueConstraintViolation',
            constraint: { fields: ['email'] }
          }
        }
      });

      expect(toProblem(error)).toMatchObject({
        status: 409,
        code: ErrorCode.DatabaseUniqueViolation,
        detail: expect.stringContaining(
          'User with the same email already exists'
        ),
        errors: [{ field: 'email', rule: 'unique', message: 'must be unique' }],
        details: { model: 'User', fields: ['email'] }
      });
    });

    test('leaves the database message out of the detail by default', () => {
      const error = prismaError(
        'P2002',
        {
          modelName: 'User',
          driverAdapterError: {
            cause: {
              kind: 'UniqueConstraintViolation',
              constraint: { fields: ['email'] }
            }
          }
        },
        'Invalid invocation in /app/src/user.ts:4\n\nUnique constraint failed'
      );

      expect(toProblem(error).detail).toBe(
        'User with the same email already exists'
      );
    });

    test('appends the database message when enabled, in production too', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'prod';
      process.env.SERVER_ERROR_DATABASE_MESSAGE_ENABLED = 'true';
      jest.resetModules();

      try {
        const { toProblem: enabledToProblem } =
          await import('../../errors/problem');

        const problem = enabledToProblem(
          prismaError(
            'P2011',
            { modelName: 'Post' },
            'Invalid invocation in /app/src/post.ts:4\n\n  code frame\n\nNull constraint violation on the fields: (`title`)'
          )
        );

        expect(problem.detail).toBe(
          'Post is missing a required field (Null constraint violation on the fields: (`title`))'
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        delete process.env.SERVER_ERROR_DATABASE_MESSAGE_ENABLED;
        jest.resetModules();
      }
    });

    test('maps a registered application error code', () => {
      const { ProblemTestConflict } = defineErrors({
        ProblemTestConflict: { status: 409, title: 'Test conflict' }
      });

      const problem = toProblem(
        new ApplicationError(ProblemTestConflict, 'Conflicting', { id: 1 })
      );

      expect(problem).toMatchObject({
        type: 'urn:appweaver:error:problem-test-conflict',
        title: 'Test conflict',
        status: 409,
        code: 'PROBLEM_TEST_CONFLICT',
        detail: 'Conflicting',
        details: { id: 1 }
      });
    });

    test('maps an unregistered application error code to a server error', () => {
      expect(
        toProblem(new ApplicationError('PROBLEM_TEST_UNKNOWN', 'Failed'))
      ).toMatchObject({
        status: 500,
        title: 'Application error',
        code: 'PROBLEM_TEST_UNKNOWN'
      });
    });

    test('hides the details and causes of server errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'prod';
      jest.resetModules();

      try {
        const common = await import('@appweaver/common');
        const { toProblem: prodToProblem } =
          await import('../../errors/problem');

        const known = prodToProblem(
          new common.ConfigurationError(
            common.ErrorCode.ConfigurationInvalid,
            'Invalid setup',
            { errors: ['secret'] },
            { cause: new Error('db') }
          )
        );
        const unknown = prodToProblem(new Error('connection string leaked'));
        const client = prodToProblem(
          new common.RequestError(
            common.ErrorCode.ValidationFailed,
            'Invalid',
            { errors: [] }
          )
        );

        expect(known.detail).toBe('Invalid setup');
        expect(known.details).toBeUndefined();
        expect(unknown.detail).toBe('Internal server error');
        expect(client.detail).toBe('Invalid');
      } finally {
        process.env.NODE_ENV = originalEnv;
        jest.resetModules();
      }
    });

    test('maps a request error thrown by the application', () => {
      const error = new RequestError(ErrorCode.ValidationFailed, 'Invalid', {
        errors: [{ field: 'name', rule: 'taken', message: 'is taken' }]
      });

      expect(toProblem(error)).toMatchObject({
        status: 400,
        errors: [{ field: 'name', rule: 'taken', message: 'is taken' }]
      });
    });
  });

  describe('errorType', () => {
    /** Returns the type URI of a code with the given type base configured. */
    const typeWithBase = async (base: string, code: string) => {
      process.env.APP_TYPE_BASE = base;
      jest.resetModules();
      try {
        const { errorType: configuredErrorType } =
          await import('../../errors/problem');
        return configuredErrorType(code);
      } finally {
        delete process.env.APP_TYPE_BASE;
        jest.resetModules();
      }
    };

    test('joins the URN base, the error category and the kebab-case code', () => {
      expect(errorType(ErrorCode.DatabaseNullViolation)).toBe(
        'urn:appweaver:error:database-null-violation'
      );
    });

    test('joins a URL base with slashes', async () => {
      expect(
        await typeWithBase(
          'https://docs.example.com/types',
          ErrorCode.ResourceNotFound
        )
      ).toBe('https://docs.example.com/types/error/resource-not-found');
    });

    test('ignores the trailing separator of the base', async () => {
      expect(await typeWithBase('urn:shop:', ErrorCode.ResourceNotFound)).toBe(
        'urn:shop:error:resource-not-found'
      );
      expect(
        await typeWithBase(
          'https://shop.example.com/',
          ErrorCode.ResourceNotFound
        )
      ).toBe('https://shop.example.com/error/resource-not-found');
    });
  });
});
