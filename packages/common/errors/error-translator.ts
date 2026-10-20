import { AppweaverError } from './appweaver-error';

/** Converts the errors of a library into the errors of the framework, registered with {@link defineErrorTranslator}. */
export type ErrorTranslator = {
  /** The name of the translator, i.e. `database`, replacing an earlier translator of the same name. */
  name: string;
  /** Tells whether an error is one of the library. */
  matches(error: unknown): boolean;
  /** Converts an error of the library into a framework error. */
  translate(error: unknown): AppweaverError;
  /** Describes an error of the library, i.e. the violated constraint, for the detail of a problem response. */
  describe?(error: unknown): string;
  /** Tells whether the description may be shown, which defaults to every environment except production. */
  exposeDescription?(): boolean;
};

const translators = new Map<string, ErrorTranslator>();

/**
 * Registers the translator of the errors of a library, so the errors it throws reach the API as framework errors,
 * i.e. the Prisma errors as a `DatabaseError` naming the violated constraint. A module registers the translator of the
 * library it wraps, at the top level of a module it loads.
 *
 * @param {ErrorTranslator} translator - The translator.
 */
export function defineErrorTranslator(translator: ErrorTranslator): void {
  translators.set(translator.name, translator);
}

/**
 * Returns the translator of an error, or undefined for an error no translator matches.
 *
 * @param {unknown} error - The error.
 * @return {ErrorTranslator | undefined} The first registered translator matching the error.
 */
export function findErrorTranslator(
  error: unknown
): ErrorTranslator | undefined {
  for (const translator of translators.values()) {
    if (translator.matches(error)) {
      return translator;
    }
  }
  return undefined;
}

/**
 * Converts an error of a library into a framework error with its translator, leaving any other error as it is.
 *
 * @param {unknown} error - The error.
 * @return {unknown} The framework error, or the error itself.
 */
export function translateError(error: unknown): unknown {
  return findErrorTranslator(error)?.translate(error) ?? error;
}
