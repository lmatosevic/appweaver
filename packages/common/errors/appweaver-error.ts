import { ErrorDetails } from './error-details';

/** The part of the framework, or the application, an error is raised by. */
export type ErrorModule =
  | 'request'
  | 'configuration'
  | 'context'
  | 'database'
  | 'resource'
  | 'auth'
  | 'account'
  | 'oauth2'
  | 'recaptcha'
  | 'file'
  | 'export'
  | 'queue'
  | 'mailer'
  | 'lock'
  | 'application';

/** The details and the options of an error, the details being optional for
 * the codes that require none. */
export type ErrorArgs<C extends string> =
  {} extends ErrorDetails<C>
    ? [details?: ErrorDetails<C>, options?: ErrorOptions]
    : [details: ErrorDetails<C>, options?: ErrorOptions];

/**
 * The base of every error the framework raises. It carries a stable `code`
 * and the `details` specific to it, and no HTTP status, so a service throws it
 * the same way whether it is called by a route, a queue worker or a script.
 * The API layer maps the code to the HTTP status of the response.
 *
 * The error that caused it is kept as the standard `cause`.
 */
export abstract class AppweaverError<C extends string = string> extends Error {
  public abstract readonly module: ErrorModule;
  public readonly details: ErrorDetails<C>;

  constructor(
    public readonly code: C,
    message: string,
    ...[details, options]: ErrorArgs<C>
  ) {
    super(message, options);
    this.name = new.target.name;
    this.details = (details ?? {}) as ErrorDetails<C>;
  }

  /** Checks whether the error has the given code, narrowing its details. */
  public is<K extends C>(code: K): this is AppweaverError<K> {
    return (this.code as string) === code;
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      module: this.module,
      message: this.message,
      details: this.details,
      cause: this.cause instanceof Error ? this.cause.message : this.cause
    };
  }
}

/**
 * Checks whether a value is an {@link AppweaverError}, also when it was created
 * by another copy of the package.
 */
export function isAppweaverError(error: unknown): error is AppweaverError {
  if (error instanceof AppweaverError) {
    return true;
  }
  const e = error as Partial<AppweaverError> | null;
  return (
    error instanceof Error &&
    typeof e?.code === 'string' &&
    typeof e?.module === 'string' &&
    typeof e?.details === 'object'
  );
}
