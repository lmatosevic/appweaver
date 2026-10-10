import { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode, RequestError } from '@appweaver/common';
import { toProblem } from './problem';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * The global error handler, responding with the problem details of the error.
 * A response that already set a content type other than JSON, i.e. a file
 * stream, receives the detail of the problem as plain text.
 */
export function errorHandler(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const problem = toProblem(error, request);

  if (problem.status >= 500) {
    request.log.error({ err: error }, problem.detail);
  }

  const contentType = reply.getHeader('Content-Type');
  if (contentType && !String(contentType).includes('json')) {
    return reply.status(problem.status).send(problem.detail);
  }

  return reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
}

/** Responds to the requests no route matches. */
export function notFoundHandler(request: FastifyRequest): never {
  throw new RequestError(
    ErrorCode.RouteNotFound,
    `Route ${request.method}:${request.url.split('?')[0]} not found`
  );
}
