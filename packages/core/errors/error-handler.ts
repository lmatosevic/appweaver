import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from './index';

export function errorHandler(
  err: FastifyError | HttpError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { message, statusCode, error, errorCode } = err as HttpError;

  if (!statusCode || statusCode >= 500) {
    if (!error) {
      request.log.error(err.stack);
    } else {
      request.log.error(error);
    }
  }

  const errorResponse = {
    errorCode: errorCode || statusCode || 500,
    message: message || 'Unknown error'
  };

  const contentType = reply.getHeader('Content-Type');

  reply
    .status(statusCode || 500)
    .send(
      contentType && contentType !== 'application/json'
        ? errorResponse.message
        : errorResponse
    );
}
