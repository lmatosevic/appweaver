import { ConfigurationError, ErrorCode } from '@appweaver/common';
import { define, injectAll } from '../context';

/** The HTTP status and the title of the responses of an error code. */
export type ErrorHttpMapping = {
  /** The HTTP status code of the response, from 400 to 599. */
  status: number;
  /** A short summary of the error, the same for every occurrence. */
  title: string;
};

/** The HTTP mapping of every framework error code. */
export const errorHttpMap: { readonly [C in ErrorCode]: ErrorHttpMapping } = {
  [ErrorCode.InternalError]: { status: 500, title: 'Internal server error' },
  [ErrorCode.ValidationFailed]: { status: 400, title: 'Validation failed' },
  [ErrorCode.MalformedRequest]: { status: 400, title: 'Malformed request' },
  [ErrorCode.UnsupportedMediaType]: {
    status: 415,
    title: 'Unsupported media type'
  },
  [ErrorCode.PayloadTooLarge]: { status: 413, title: 'Payload too large' },
  [ErrorCode.RouteNotFound]: { status: 404, title: 'Route not found' },
  [ErrorCode.RateLimited]: { status: 429, title: 'Too many requests' },
  [ErrorCode.RequestFailed]: { status: 400, title: 'Request failed' },

  [ErrorCode.ConfigurationInvalid]: {
    status: 500,
    title: 'Invalid configuration'
  },
  [ErrorCode.ContextDefinitionMissing]: {
    status: 500,
    title: 'Missing context definition'
  },
  [ErrorCode.ContextDefinitionDuplicate]: {
    status: 500,
    title: 'Duplicate context definition'
  },
  [ErrorCode.ContextServerUnavailable]: {
    status: 500,
    title: 'Server unavailable'
  },

  [ErrorCode.DatabaseUniqueViolation]: {
    status: 409,
    title: 'Unique constraint violation'
  },
  [ErrorCode.DatabaseForeignKeyViolation]: {
    status: 409,
    title: 'Relation constraint violation'
  },
  [ErrorCode.DatabaseNullViolation]: {
    status: 400,
    title: 'Required field missing'
  },
  [ErrorCode.DatabaseValueTooLong]: { status: 400, title: 'Value too long' },
  [ErrorCode.DatabaseValueOutOfRange]: {
    status: 400,
    title: 'Value out of range'
  },
  [ErrorCode.DatabaseInvalidValue]: { status: 400, title: 'Invalid value' },
  [ErrorCode.DatabaseRecordNotFound]: {
    status: 404,
    title: 'Record not found'
  },
  [ErrorCode.DatabaseWriteConflict]: { status: 409, title: 'Write conflict' },
  [ErrorCode.DatabaseInvalidTransaction]: {
    status: 500,
    title: 'Invalid transaction'
  },
  [ErrorCode.DatabaseUnavailable]: {
    status: 503,
    title: 'Database unavailable'
  },
  [ErrorCode.DatabaseOperationFailed]: {
    status: 500,
    title: 'Database operation failed'
  },

  [ErrorCode.ResourceNotFound]: { status: 404, title: 'Resource not found' },
  [ErrorCode.ResourceForbidden]: {
    status: 403,
    title: 'Resource access forbidden'
  },
  [ErrorCode.ResourceInvalidSort]: { status: 400, title: 'Invalid sort' },
  [ErrorCode.ResourceInvalidAggregate]: {
    status: 400,
    title: 'Invalid aggregation'
  },
  [ErrorCode.ResourceInvalidCursor]: {
    status: 400,
    title: 'Invalid pagination cursor'
  },
  [ErrorCode.ResourceInvalidQueryParameter]: {
    status: 400,
    title: 'Invalid query parameter'
  },
  [ErrorCode.ResourceInvalidRelation]: {
    status: 400,
    title: 'Invalid relation'
  },
  [ErrorCode.ResourceDeleteRestricted]: {
    status: 409,
    title: 'Delete restricted'
  },

  [ErrorCode.AuthUnauthorized]: { status: 401, title: 'Unauthorized' },
  [ErrorCode.AuthInvalidCredentials]: {
    status: 401,
    title: 'Invalid credentials'
  },
  [ErrorCode.AuthInvalidHeader]: {
    status: 401,
    title: 'Invalid authorization header'
  },
  [ErrorCode.AuthInvalidToken]: { status: 401, title: 'Invalid token' },
  [ErrorCode.AuthTokenExpired]: { status: 401, title: 'Token expired' },
  [ErrorCode.AuthForbidden]: { status: 403, title: 'Forbidden' },
  [ErrorCode.AuthScopeForbidden]: {
    status: 403,
    title: 'Token scope forbidden'
  },
  [ErrorCode.AuthUserNotFound]: {
    status: 400,
    title: 'User not found or disabled'
  },
  [ErrorCode.AuthPasswordDisabled]: {
    status: 403,
    title: 'Password authentication disabled'
  },
  [ErrorCode.AuthPasswordInvalid]: { status: 403, title: 'Invalid password' },
  [ErrorCode.AuthPasswordWeak]: { status: 400, title: 'Password too weak' },
  [ErrorCode.AuthPasswordRequired]: {
    status: 401,
    title: 'Password confirmation required'
  },
  [ErrorCode.AuthApiKeyMissing]: { status: 401, title: 'API key missing' },
  [ErrorCode.AuthApiKeyInvalid]: { status: 401, title: 'Invalid API key' },
  [ErrorCode.AuthApiKeyExpired]: { status: 403, title: 'API key expired' },
  [ErrorCode.AuthProxyAuthenticationRequired]: {
    status: 407,
    title: 'Proxy authentication required'
  },
  [ErrorCode.AuthInvalidRedirectUrl]: {
    status: 400,
    title: 'Invalid redirect URL'
  },

  [ErrorCode.AccountFeatureUnavailable]: {
    status: 501,
    title: 'Account feature unavailable'
  },
  [ErrorCode.AccountEmailAlreadyVerified]: {
    status: 409,
    title: 'Email already verified'
  },
  [ErrorCode.AccountPasswordNotSet]: { status: 403, title: 'Password not set' },

  [ErrorCode.OAuth2ProviderError]: {
    status: 502,
    title: 'OAuth2 provider error'
  },
  [ErrorCode.OAuth2EmailUnavailable]: {
    status: 403,
    title: 'OAuth2 email unavailable'
  },
  [ErrorCode.OAuth2RegistrationDisabled]: {
    status: 403,
    title: 'OAuth2 registration disabled'
  },
  [ErrorCode.OAuth2AccountConflict]: {
    status: 409,
    title: 'OAuth2 account linked to another user'
  },
  [ErrorCode.OAuth2UserRejected]: {
    status: 403,
    title: 'OAuth2 user rejected'
  },

  [ErrorCode.RecaptchaMissing]: { status: 400, title: 'reCAPTCHA missing' },
  [ErrorCode.RecaptchaInvalid]: { status: 400, title: 'Invalid reCAPTCHA' },
  [ErrorCode.RecaptchaActionMismatch]: {
    status: 403,
    title: 'reCAPTCHA action mismatch'
  },
  [ErrorCode.RecaptchaLowScore]: { status: 403, title: 'reCAPTCHA low score' },
  [ErrorCode.RecaptchaUnavailable]: {
    status: 502,
    title: 'reCAPTCHA unavailable'
  },

  [ErrorCode.FileNotFound]: { status: 404, title: 'File not found' },
  [ErrorCode.FileForbidden]: { status: 403, title: 'File access forbidden' },
  [ErrorCode.FileFieldNotFound]: { status: 400, title: 'File field not found' },
  [ErrorCode.FileUnsupportedType]: {
    status: 415,
    title: 'Unsupported file type'
  },
  [ErrorCode.FileTooLarge]: { status: 413, title: 'File too large' },
  [ErrorCode.FileLimitExceeded]: {
    status: 400,
    title: 'File limit exceeded'
  },
  [ErrorCode.FileInvalidPath]: { status: 400, title: 'Invalid file path' },
  [ErrorCode.FileNoneProvided]: { status: 400, title: 'No files provided' },
  [ErrorCode.FileUploadFailed]: { status: 400, title: 'File upload failed' },
  [ErrorCode.FileDeleteFailed]: { status: 400, title: 'File delete failed' },
  [ErrorCode.FileStorageError]: { status: 500, title: 'File storage error' },

  [ErrorCode.ExportFailed]: { status: 500, title: 'Export failed' },

  [ErrorCode.QueueClosed]: { status: 503, title: 'Queue closed' },
  [ErrorCode.QueueUnavailable]: { status: 503, title: 'Queue unavailable' },

  [ErrorCode.MailerSendFailed]: { status: 502, title: 'Email sending failed' },
  [ErrorCode.MailerJobNotFound]: {
    status: 500,
    title: 'Email job not found'
  },

  [ErrorCode.LockNotAcquired]: { status: 503, title: 'Resource is locked' }
};

/** The HTTP mapping of an application error, and optionally its code. */
export type ApplicationErrorMapping = ErrorHttpMapping & {
  /** The error code, derived from the name of the error by default, i.e.
   * `OUT_OF_STOCK` for `OutOfStock`. */
  code?: string;
};

/** The code of an application error of a name, i.e. `OUT_OF_STOCK` for
 * `OutOfStock`. */
export type ErrorCodeOf<Name extends string> =
  UpperSnake<Name> extends `_${infer Code}` ? Code : UpperSnake<Name>;

/** Upper cases a name, prefixing each of its capitals with an underscore. */
type UpperSnake<S extends string> = S extends `${infer Head}${infer Tail}`
  ? `${Head extends Lowercase<Head> ? Uppercase<Head> : `_${Head}`}${UpperSnake<Tail>}`
  : '';

/** The names of the framework error codes, keyed by the codes. */
const FRAMEWORK_NAMES = new Map<string, string>(
  Object.entries(ErrorCode).map(([name, code]) => [code, name])
);

/** The application errors registered by `defineErrors`. */
type ApplicationErrorEntry = ErrorHttpMapping & { name: string; code: string };

/** Names the application errors in the application context. */
const APPLICATION_ERROR = Symbol('ApplicationError');

/**
 * Registers the errors of the application with their HTTP mapping, for the
 * `ApplicationError`s thrown with them. The errors are named in PascalCase,
 * the same way as the members of `ErrorCode`, each code derived from its name,
 * i.e. `OUT_OF_STOCK` for `OutOfStock`, unless the mapping gives one. The codes
 * are added to the error code enum of the OpenAPI specification under their
 * names, and can be listed in the documented responses of a route with
 * `errorResponses`.
 *
 * Call it at the top level of a module, and import the returned codes where
 * the errors are thrown, so they are registered before any route uses them.
 *
 * @example
 * export const ShopErrors = defineErrors({
 *   OutOfStock: { status: 409, title: 'Product out of stock' }
 * });
 *
 * throw new ApplicationError(ShopErrors.OutOfStock, `${product.name} is out of stock`, { productId });
 *
 * @param {Object} errors The HTTP mapping keyed by the name of the error.
 * @returns {Object} The registered codes, keyed by their names.
 * @throws {ConfigurationError} If a name is not in PascalCase, a name or a code
 * is one of the framework, already registered with another mapping, or a code
 * is mapped to a status outside 400-599.
 */
export function defineErrors<
  const T extends Record<string, ApplicationErrorMapping>
>(
  errors: T
): {
  readonly [K in keyof T]: T[K] extends { code: infer C extends string }
    ? C
    : ErrorCodeOf<K & string>;
} {
  const codes = {} as Record<string, string>;

  for (const [name, mapping] of Object.entries(errors)) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `Error name '${name}' must be in PascalCase, i.e. 'OutOfStock'`
      );
    }

    const code = mapping.code ?? errorCodeOf(name);
    const registered = applicationErrors().get(code);
    const nameTaken = [...applicationErrors()].some(
      ([other, error]) => error.name === name && other !== code
    );
    if (
      FRAMEWORK_NAMES.has(code) ||
      Object.hasOwn(ErrorCode, name) ||
      nameTaken ||
      (registered &&
        (registered.name !== name ||
          registered.status !== mapping.status ||
          registered.title !== mapping.title))
    ) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `Error '${name}' with the code '${code}' is already defined`
      );
    }
    if (
      !Number.isInteger(mapping.status) ||
      mapping.status < 400 ||
      mapping.status > 599
    ) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `Error code '${code}' must map to an HTTP status from 400 to 599`
      );
    }

    if (!registered) {
      define<ApplicationErrorEntry>(
        { name, code, status: mapping.status, title: mapping.title },
        APPLICATION_ERROR,
        'append'
      );
    }
    codes[name] = code;
  }

  return codes as any;
}

/**
 * Returns the HTTP mapping of a framework or application error code, or
 * undefined for a code that is not registered.
 */
export function errorHttpMapping(code: string): ErrorHttpMapping | undefined {
  if (FRAMEWORK_NAMES.has(code)) {
    return errorHttpMap[code as ErrorCode];
  }
  const error = applicationErrors().get(code);
  return error && { status: error.status, title: error.title };
}

/** Returns every framework and application error code. */
export function errorCodes(): string[] {
  return [...FRAMEWORK_NAMES.keys(), ...applicationErrors().keys()];
}

/**
 * Returns the PascalCase name of a framework or application error code, i.e.
 * `ResourceNotFound` for `RESOURCE_NOT_FOUND`, or undefined for a code that is
 * not registered.
 */
export function errorCodeName(code: string): string | undefined {
  return FRAMEWORK_NAMES.get(code) ?? applicationErrors().get(code)?.name;
}

/** Returns the application errors of the context, keyed by their codes. */
function applicationErrors(): Map<string, ApplicationErrorEntry> {
  return new Map(
    injectAll<ApplicationErrorEntry>(APPLICATION_ERROR).map((error) => [
      error.code,
      error
    ])
  );
}

/** Derives the code of an error from its PascalCase name, see {@link ErrorCodeOf}. */
function errorCodeOf(name: string): string {
  return name
    .replace(/[A-Z]/g, (letter) => `_${letter}`)
    .toUpperCase()
    .slice(1);
}
