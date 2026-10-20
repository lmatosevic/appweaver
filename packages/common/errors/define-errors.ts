import { ConfigurationError } from './common-errors';
import { ErrorCode } from './error-code';

/** The HTTP status and the title of the responses of an error code. */
export type ErrorHttpMapping = {
  /** The HTTP status code of the response, from 400 to 599. */
  status: number;
  /** A short summary of the error, the same for every occurrence. */
  title: string;
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

/** The application errors registered by `defineErrors`, keyed by their codes. */
const applicationErrors = new Map<string, ApplicationErrorEntry>();

/**
 * Registers the errors of the application with their HTTP mapping, for the
 * `ApplicationError`s thrown with them. The errors are named in PascalCase,
 * the same way as the members of `ErrorCode`, each code derived from its name,
 * i.e. `OUT_OF_STOCK` for `OutOfStock`, unless the mapping gives one. The codes
 * are added to the error code enum of the OpenAPI specification under their
 * names, and can be listed in the documented responses of a route with
 * `errorResponses` of `@appweaver/core`. A module without a server declares
 * its codes the same way.
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
 * @return {Object} The registered codes, keyed by their names.
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
    const registered = applicationErrors.get(code);
    const nameTaken = [...applicationErrors].some(
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
      applicationErrors.set(code, {
        name,
        code,
        status: mapping.status,
        title: mapping.title
      });
    }
    codes[name] = code;
  }

  return codes as any;
}

/**
 * Returns the HTTP mapping of an application error code registered with `defineErrors`, or undefined for any other
 * code.
 */
export function applicationErrorMapping(
  code: string
): ErrorHttpMapping | undefined {
  const error = applicationErrors.get(code);
  return error && { status: error.status, title: error.title };
}

/** Returns whether a code is one of the framework error codes of `ErrorCode`. */
export function isFrameworkErrorCode(code: string): code is ErrorCode {
  return FRAMEWORK_NAMES.has(code);
}

/** Returns every framework and application error code. */
export function errorCodes(): string[] {
  return [...FRAMEWORK_NAMES.keys(), ...applicationErrors.keys()];
}

/**
 * Returns the PascalCase name of a framework or application error code, i.e.
 * `ResourceNotFound` for `RESOURCE_NOT_FOUND`, or undefined for a code that is
 * not registered.
 */
export function errorCodeName(code: string): string | undefined {
  return FRAMEWORK_NAMES.get(code) ?? applicationErrors.get(code)?.name;
}

/** Derives the code of an error from its PascalCase name, see {@link ErrorCodeOf}. */
function errorCodeOf(name: string): string {
  return name
    .replace(/[A-Z]/g, (letter) => `_${letter}`)
    .toUpperCase()
    .slice(1);
}
