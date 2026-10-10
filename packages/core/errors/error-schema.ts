import { STATUS_CODES } from 'node:http';
import { TSchema, Type } from '@sinclair/typebox';
import { CONFIG_NAME, ConfigurationError, ErrorCode } from '@appweaver/common';
import { createSchemaModel } from '../utils';
import { PROBLEM_CONTENT_TYPE } from './error-handler';
import { errorCodes, errorHttpMapping } from './error-http-map';

export const PROBLEM_DETAILS_SCHEMA_NAME = 'ProblemDetails';

/** Lists the error codes of a documented error response. The OpenAPI document
 * narrows the `code` of the response to them, see {@link documentErrorResponses}. */
export const ERROR_CODES_EXTENSION = `x-${CONFIG_NAME}-errors`;

export const FieldErrorSchema = Type.Object({
  field: Type.String({ example: 'email' }),
  rule: Type.String({ example: 'unique' }),
  message: Type.String({ example: 'must be unique' }),
  pointer: Type.Optional(Type.String({ example: '#/body/email' }))
});

/** The RFC 9457 problem details of every error response, its `code` holding
 * the framework error codes. The server registers it with the application
 * codes too, see {@link problemDetailsSchema}. */
export const ProblemDetailsSchema = Type.Object(
  {
    type: Type.String({ example: 'urn:appweaver:error:resource-not-found' }),
    title: Type.String({ example: 'Resource not found' }),
    status: Type.Integer({ example: 404 }),
    code: errorCodeSchema(Object.values(ErrorCode)),
    detail: Type.String({ example: 'Post not found' }),
    instance: Type.Optional(Type.String({ example: '/api/posts/1' })),
    requestId: Type.Optional(Type.String({ example: 'req-1' })),
    errors: Type.Optional(Type.Array(FieldErrorSchema)),
    details: Type.Optional(Type.Object({}, { additionalProperties: true }))
  },
  { $id: PROBLEM_DETAILS_SCHEMA_NAME, title: PROBLEM_DETAILS_SCHEMA_NAME }
);

/** The error responses of a route, the client ones under `4xx` and the
 * server ones under `5xx`, each listing its error codes by their status. */
export type ErrorResponse = {
  description: string;
  [ERROR_CODES_EXTENSION]: Record<string, string[]>;
  content: Record<string, { schema: unknown }>;
};

/** The error responses of a route, keyed by their status range. */
export type ErrorResponses = Record<'4xx' | '5xx', ErrorResponse>;

/** The errors any route can respond with. */
const DEFAULT_ERROR_CODES: string[] = [
  ErrorCode.ValidationFailed,
  ErrorCode.MalformedRequest,
  ErrorCode.RateLimited,
  ErrorCode.InternalError
];

const problemDetailsRef = createSchemaModel(ProblemDetailsSchema);

/**
 * Returns the problem details schema with every framework and application
 * error code, the ones registered with `defineErrors` so far included.
 */
export function problemDetailsSchema(): typeof ProblemDetailsSchema {
  return {
    ...ProblemDetailsSchema,
    properties: {
      ...ProblemDetailsSchema.properties,
      code: errorCodeSchema(errorCodes())
    }
  };
}

/**
 * Builds the documented error responses of a route from the error codes it
 * can respond with. The validation, malformed request, rate limit and internal
 * errors are always included.
 *
 * The route declares a `4xx` and a `5xx` response of the problem details
 * schema, which list their codes by their status in the
 * {@link ERROR_CODES_EXTENSION}. The server compiles no serializer for them
 * (see {@link stashErrorResponses}), and the OpenAPI document holds a response
 * per status instead, narrowing the `code` to the codes of the status (see
 * {@link documentErrorResponses}), so a generated client types the errors of
 * every route.
 *
 * @example
 * router.post('/checkout', {
 *   schema: {
 *     response: {
 *       200: OrderResponse,
 *       ...errorResponses(ShopErrors.OutOfStock, ErrorCode.ResourceNotFound)
 *     }
 *   }
 * }, handler);
 *
 * @param {...string} codes The framework or application error codes of the
 * route, the application ones registered with `defineErrors`.
 * @returns {ErrorResponses} The error responses to spread into the `response`
 * of a route schema.
 * @throws {ConfigurationError} If a code is not registered.
 */
export function errorResponses(...codes: string[]): ErrorResponses {
  const ranges: Record<'4xx' | '5xx', Record<string, string[]>> = {
    '4xx': {},
    '5xx': {}
  };

  for (const code of new Set([...DEFAULT_ERROR_CODES, ...codes])) {
    const mapping = errorHttpMapping(code);
    if (!mapping) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `Error code '${code}' is not registered with defineErrors`
      );
    }
    const range = ranges[mapping.status < 500 ? '4xx' : '5xx'];
    (range[mapping.status] ??= []).push(code);
  }

  const response = (
    description: string,
    byStatus: Record<string, string[]>
  ): ErrorResponse => ({
    description,
    [ERROR_CODES_EXTENSION]: Object.fromEntries(
      Object.entries(byStatus).map(([status, statusCodes]) => [
        status,
        statusCodes.sort()
      ])
    ),
    content: { [PROBLEM_CONTENT_TYPE]: { schema: problemDetailsRef } }
  });

  return {
    '4xx': response('Client error', ranges['4xx']),
    '5xx': response('Server error', ranges['5xx'])
  };
}

/**
 * Merges error responses into the responses of a route, joining their codes.
 * A `4xx` or `5xx` response the route declares in another form is kept as
 * it is.
 */
export function mergeErrorResponses(
  responses: Record<string, unknown>,
  errors: ErrorResponses
): Record<string, unknown> {
  const merged = { ...responses };

  for (const [range, response] of Object.entries(errors)) {
    const current = merged[range];
    if (current === undefined) {
      merged[range] = response;
      continue;
    }

    const currentCodes = responseErrorCodes(current);
    if (currentCodes) {
      merged[range] = errorResponses(
        ...Object.values(currentCodes).flat(),
        ...Object.values(response[ERROR_CODES_EXTENSION]).flat()
      )[range as keyof ErrorResponses];
    }
  }
  return merged;
}

/** Holds the error responses of a route schema, kept out of the responses the
 * serializers are compiled for, see {@link stashErrorResponses}. */
export const ERROR_RESPONSES_KEY = `x-${CONFIG_NAME}-error-responses`;

/**
 * Moves the error responses of a route out of the responses of its schema
 * into the {@link ERROR_RESPONSES_KEY}, before the server compiles the
 * serializers of the route. The problem details of an error response are
 * built by the error handler, so they need no serializer, and compiling one
 * per error response of every route slows down the start of the server. The
 * OpenAPI document still holds them, see {@link documentErrorResponses}.
 *
 * Registered as an `onRoute` hook of the server.
 */
export function stashErrorResponses(route: {
  schema?: Record<string, any>;
}): void {
  const response = route.schema?.response as
    | Record<string, unknown>
    | undefined;
  if (!response) {
    return;
  }

  const errors: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(response)) {
    if (responseErrorCodes(value)) {
      errors[key] = value;
      delete response[key];
    }
  }

  // The HEAD route of a GET route shares its schema, so a stash is kept
  if (Object.keys(errors).length > 0) {
    route.schema![ERROR_RESPONSES_KEY] = {
      ...route.schema![ERROR_RESPONSES_KEY],
      ...errors
    };
  }
}

/**
 * Returns the responses of a route the way the OpenAPI document holds them,
 * the `4xx` and `5xx` error responses replaced by a response per status of
 * their codes, narrowing the `code` of the problem details to them. A status
 * the route declares a response of its own for keeps it.
 *
 * @param {Object} responses The responses of a route schema.
 * @returns {Object} The documented responses.
 */
export function documentErrorResponses(
  responses: Record<string, unknown>
): Record<string, unknown> {
  const documented: Record<string, unknown> = {};

  for (const [key, response] of Object.entries(responses)) {
    const byStatus = responseErrorCodes(response);
    if (!byStatus) {
      documented[key] = response;
      continue;
    }

    for (const [status, codes] of Object.entries(byStatus)) {
      if (responses[status] !== undefined) {
        continue;
      }
      documented[status] = {
        description: STATUS_CODES[status] ?? 'Error',
        content: {
          [PROBLEM_CONTENT_TYPE]: {
            schema: {
              allOf: [
                problemDetailsRef,
                {
                  type: 'object',
                  required: ['code'],
                  properties: { code: errorCodeSchema(codes) }
                }
              ]
            }
          }
        }
      };
    }
  }
  return documented;
}

/** Returns the error codes by their status of a response built by {@link errorResponses}. */
function responseErrorCodes(
  response: unknown
): Record<string, string[]> | undefined {
  const codes = (response as Partial<ErrorResponse> | undefined)?.[
    ERROR_CODES_EXTENSION
  ];
  return codes && typeof codes === 'object' && !Array.isArray(codes)
    ? codes
    : undefined;
}

function errorCodeSchema(codes: string[]): TSchema {
  return Type.Unsafe<string>({
    type: 'string',
    enum: codes,
    example: codes[0]
  });
}
