import { Environment, config, errorMessage } from '@appweaver/common';

/**
 * Represents an HTTP error with additional contextual information.
 * Extends the built-in `Error` class by including an HTTP status code,
 * an optional error detail, and an optional error code.
 *
 * The error message may include additional details if the application
 * is not running in the production environment.
 *
 * @class
 * @extends Error
 * @param {string} text - The main error message.
 * @param {number} [statusCode=400] - The HTTP status code associated with the error.
 * @param {unknown} [error] - Optional additional error detail, such as an error object or metadata.
 * @param {number} [errorCode] - Optional application-specific error code.
 */
export class HttpError extends Error {
  constructor(
    text: string,
    public statusCode: number = 400,
    public error?: unknown,
    public errorCode?: number
  ) {
    super(
      config.APP_ENV !== Environment.Production && error
        ? ` ${text} (${errorMessage(error)})`
        : text
    );
  }
}
