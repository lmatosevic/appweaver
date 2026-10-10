import { ErrorCode } from '@appweaver/common';
import {
  errorHandler,
  notFoundHandler,
  PROBLEM_CONTENT_TYPE
} from '../../errors/error-handler';
import { ResourceError } from '../../resource/resource-error';

describe('error-handler', () => {
  const createRequest = () =>
    ({ url: '/api/posts/1', id: 'req-1', log: { error: jest.fn() } }) as any;

  const createReply = (contentType?: string) => {
    const reply: any = {
      statusCode: undefined,
      payload: undefined,
      contentType: undefined,
      getHeader: () => contentType,
      status(code: number) {
        reply.statusCode = code;
        return reply;
      },
      type(type: string) {
        reply.contentType = type;
        return reply;
      },
      send(payload: any) {
        reply.payload = payload;
        return reply;
      }
    };
    return reply;
  };

  const notFound = () =>
    new ResourceError(ErrorCode.ResourceNotFound, 'Post not found', {
      model: 'Post',
      id: 1
    });

  describe('errorHandler', () => {
    test('sends the problem details of the error', () => {
      const reply = createReply();

      errorHandler(notFound(), createRequest(), reply);

      expect(reply.statusCode).toBe(404);
      expect(reply.contentType).toBe(PROBLEM_CONTENT_TYPE);
      expect(reply.payload).toMatchObject({
        status: 404,
        code: ErrorCode.ResourceNotFound,
        detail: 'Post not found',
        instance: '/api/posts/1',
        requestId: 'req-1'
      });
    });

    test('sends the problem details for JSON responses', () => {
      const reply = createReply('application/json; charset=utf-8');

      errorHandler(notFound(), createRequest(), reply);

      expect(reply.payload).toMatchObject({ code: ErrorCode.ResourceNotFound });
    });

    test('sends only the detail for non JSON responses', () => {
      const reply = createReply('text/csv');

      errorHandler(notFound(), createRequest(), reply);

      expect(reply.statusCode).toBe(404);
      expect(reply.payload).toBe('Post not found');
    });

    test('logs a server error', () => {
      const request = createRequest();
      const error = new Error('boom');

      errorHandler(error, request, createReply());

      expect(request.log.error).toHaveBeenCalledWith(
        { err: error },
        'Internal server error (boom)'
      );
    });

    test('does not log client errors', () => {
      const request = createRequest();

      errorHandler(notFound(), request, createReply());

      expect(request.log.error).not.toHaveBeenCalled();
    });
  });

  describe('notFoundHandler', () => {
    test('throws a route not found error', () => {
      expect(() =>
        notFoundHandler({ method: 'GET', url: '/missing?x=1' } as any)
      ).toThrow(
        expect.objectContaining({
          code: ErrorCode.RouteNotFound,
          message: 'Route GET:/missing not found'
        })
      );
    });
  });
});
