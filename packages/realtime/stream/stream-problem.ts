import { isAppweaverError } from '@appweaver/common';

/** Formats the error of a stream as the problem details the subscribers receive. */
export type StreamProblemFormat = (error: unknown) => unknown;

let format: StreamProblemFormat = (error) =>
  isAppweaverError(error)
    ? { title: error.message, status: 500, code: error.code }
    : { title: 'Stream failed', status: 500 };

/**
 * Sets how the error of a stream is formatted, the problem details of the API layer once the gateway is loaded, so
 * the streams never depend on it.
 *
 * @param {StreamProblemFormat} problemFormat - Formats an error.
 */
export function setStreamProblemFormat(
  problemFormat: StreamProblemFormat
): void {
  format = problemFormat;
}

/**
 * Formats the error of a stream as the problem details the subscribers receive.
 *
 * @param {unknown} error - The error.
 * @return {unknown} The problem details.
 */
export function streamProblem(error: unknown): unknown {
  return format(error);
}
