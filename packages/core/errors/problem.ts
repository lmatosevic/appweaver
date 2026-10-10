import {
  AppweaverError,
  config,
  Environment,
  ErrorCode,
  errorMessage,
  FieldError,
  isAppweaverError,
  logger,
  ModuleErrorCode,
  ProblemDetails,
  RequestError,
  RequestErrorCode
} from '@appweaver/common';
import {
  isPrismaError,
  prismaErrorMessage,
  toDatabaseError
} from '../database/database-error';
import { AuthError } from '../security/auth-error';
import { FileError } from '../storage/file-error';
import { errorHttpMapping, ErrorHttpMapping } from './error-http-map';

/** The request a problem occurred on. */
export type ProblemRequest = { url: string; id?: string };

type AjvError = {
  instancePath: string;
  keyword: string;
  message?: string;
  params?: { missingProperty?: string; additionalProperty?: string };
};

type FrameworkError = Error & {
  code?: string;
  statusCode?: number;
  validation?: AjvError[];
  validationContext?: string;
};

/** The errors of Fastify and its plugins, keyed by their code. */
const FASTIFY_CODES: Record<string, ErrorCode> = {
  FST_ERR_NOT_FOUND: ErrorCode.RouteNotFound,
  FST_ERR_CTP_INVALID_MEDIA_TYPE: ErrorCode.UnsupportedMediaType,
  FST_INVALID_MULTIPART_CONTENT_TYPE: ErrorCode.UnsupportedMediaType,
  FST_ERR_CTP_BODY_TOO_LARGE: ErrorCode.PayloadTooLarge,
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: ErrorCode.MalformedRequest,
  FST_ERR_CTP_EMPTY_JSON_BODY: ErrorCode.MalformedRequest,
  FST_ERR_CTP_INVALID_JSON_BODY: ErrorCode.MalformedRequest,
  FST_INVALID_JSON_FIELD_ERROR: ErrorCode.MalformedRequest,
  FST_PROTO_VIOLATION: ErrorCode.MalformedRequest,
  FST_MP_PREMATURE_CLOSE: ErrorCode.MalformedRequest,
  FST_REQ_FILE_TOO_LARGE: ErrorCode.FileTooLarge,
  FST_FILES_LIMIT: ErrorCode.FileLimitExceeded,
  FST_PARTS_LIMIT: ErrorCode.FileLimitExceeded,
  FST_FIELDS_LIMIT: ErrorCode.FileLimitExceeded,
  FST_BASIC_AUTH_MISSING_OR_BAD_AUTHORIZATION_HEADER:
    ErrorCode.AuthInvalidHeader
};

/** The rule and the message of the field errors of a database violation. */
const FIELD_RULES: Partial<Record<string, [rule: string, message: string]>> = {
  [ErrorCode.DatabaseUniqueViolation]: ['unique', 'must be unique'],
  [ErrorCode.DatabaseNullViolation]: ['required', 'is required'],
  [ErrorCode.DatabaseValueTooLong]: ['maxLength', 'is too long'],
  [ErrorCode.DatabaseValueOutOfRange]: ['range', 'is out of range'],
  [ErrorCode.DatabaseInvalidValue]: ['type', 'has an invalid value'],
  [ErrorCode.DatabaseForeignKeyViolation]: [
    'relation',
    'references a missing record, or is still referenced'
  ]
};

const UNREGISTERED_MAPPING: ErrorHttpMapping = {
  status: 500,
  title: 'Application error'
};

/**
 * Converts an error into the RFC 9457 problem details of its response. An
 * {@link AppweaverError} is mapped by its code, the errors of Fastify and its
 * plugins and of the Prisma client by what they report, and any other error
 * to an internal error.
 *
 * The 5xx problems of the production environment leave out the details and
 * the messages not written by the framework, and the other environments add
 * the message of the error cause to the detail. The message of a database
 * error cause is added in every environment, but only when the
 * `SERVER_ERROR_DATABASE_MESSAGE_ENABLED` config is set.
 *
 * @param {unknown} error The thrown error.
 * @param {ProblemRequest} [request] The request the error occurred on.
 * @returns {ProblemDetails} The problem details of the response.
 */
export function toProblem(
  error: unknown,
  request?: ProblemRequest
): ProblemDetails {
  const e = normalizeError(error);
  const known = isAppweaverError(e);
  const code = known ? e.code : ErrorCode.InternalError;
  const mapping = errorHttpMapping(code) ?? UNREGISTERED_MAPPING;

  if (mapping === UNREGISTERED_MAPPING) {
    logger.warn(`Error code '${code}' is not registered with defineErrors`);
  }

  const production = (config.APP_ENV as Environment) === Environment.Production;
  const status =
    (code as ErrorCode) === ErrorCode.RequestFailed
      ? ((error as FrameworkError).statusCode ?? mapping.status)
      : mapping.status;
  // The messages of unknown errors may expose internals, unlike the ones of
  // the framework and application errors
  let detail = (known && e.message) || mapping.title;
  const cause = known ? e.cause : error;
  if (isPrismaError(cause)) {
    if (config.SERVER_ERROR_DATABASE_MESSAGE_ENABLED) {
      detail = `${detail} (${prismaErrorMessage(cause)})`;
    }
  } else if (!production && cause !== undefined) {
    detail = `${detail} (${errorMessage(cause)})`;
  }

  const details =
    known && !(production && status >= 500) ? { ...e.details } : {};
  const errors = fieldErrors(code, details);
  if ((code as ErrorCode) === ErrorCode.ValidationFailed) {
    delete details.errors;
  }

  return {
    type: errorType(code),
    title: mapping.title,
    status,
    code,
    detail,
    instance: request?.url.split('?')[0],
    requestId: request?.id,
    ...(errors.length > 0 ? { errors } : {}),
    ...(Object.keys(details).length > 0 ? { details } : {})
  };
}

/**
 * Returns the `type` URI of the problems of an error code: the `APP_TYPE_BASE`
 * config, the `error` category and the kebab-case code, joined with colons for
 * a URN (`urn:appweaver:error:resource-not-found`) and with slashes for a URL
 * (`https://docs.example.com/types/error/resource-not-found`).
 */
export function errorType(code: string): string {
  const base = config.APP_TYPE_BASE.replace(/[:/]+$/, '');
  const separator = /^[a-z][a-z0-9+.-]*:\/\//i.test(base) ? '/' : ':';
  const name = code.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return [base, 'error', name].join(separator);
}

/**
 * Converts the errors of Fastify, its plugins and the Prisma client into an
 * {@link AppweaverError}, leaving any other error as it is.
 */
function normalizeError(error: unknown): AppweaverError | unknown {
  if (isAppweaverError(error)) {
    return error;
  }
  if (isPrismaError(error)) {
    return toDatabaseError(error);
  }

  const e = error as FrameworkError;
  if (!(error instanceof Error)) {
    return error;
  }

  if (e.validation) {
    return new RequestError(ErrorCode.ValidationFailed, e.message, {
      errors: e.validation.map((v) => validationError(v, e.validationContext))
    });
  }

  let code = e.code ? FASTIFY_CODES[e.code] : undefined;
  if (code === ErrorCode.AuthInvalidHeader && e.statusCode === 407) {
    code = ErrorCode.AuthProxyAuthenticationRequired;
  }
  if (!code && e.statusCode === 429) {
    code = ErrorCode.RateLimited;
  }
  if (!code && e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
    code = ErrorCode.RequestFailed;
  }

  return code ? frameworkError(code, e.message) : error;
}

function validationError(error: AjvError, context?: string): FieldError {
  const path = error.instancePath.split('/').filter(Boolean);
  const missing = error.params?.missingProperty;
  if (error.keyword === 'required' && missing) {
    path.push(missing);
  }
  const additional = error.params?.additionalProperty;
  if (error.keyword === 'additionalProperties' && additional) {
    path.push(additional);
  }

  return {
    field: path.join('.'),
    rule: error.keyword,
    message:
      error.keyword === 'required'
        ? 'is required'
        : error.keyword === 'additionalProperties'
          ? 'is not allowed'
          : (error.message ?? 'is invalid'),
    pointer: `#/${[context, ...path].filter(Boolean).join('/')}`
  };
}

function fieldErrors(
  code: string,
  details: Record<string, unknown>
): FieldError[] {
  if ((code as ErrorCode) === ErrorCode.ValidationFailed) {
    return (details.errors as FieldError[]) ?? [];
  }

  const rule = FIELD_RULES[code];
  const fields = details.fields as string[] | undefined;
  if (!rule || !fields) {
    return [];
  }
  return fields.map((field) => ({ field, rule: rule[0], message: rule[1] }));
}

/** Creates the error of a code raised by Fastify or its plugins, of the
 * module the code belongs to. */
function frameworkError(code: ErrorCode, message: string): AppweaverError {
  if (code.startsWith('FILE_')) {
    return new FileError(code as ModuleErrorCode<'FILE'>, message);
  }
  if (code.startsWith('AUTH_')) {
    return new AuthError(code as ModuleErrorCode<'AUTH'>, message);
  }
  return new RequestError(code as RequestErrorCode, message);
}
