import { errorHandler } from '../../errors/error-handler';
import { HttpError } from '../../errors/http-error';

describe('error-handler', () => {
  const createRequest = () => ({ log: { error: jest.fn() } }) as any;

  const createReply = (contentType?: string) => {
    const reply: any = {
      statusCode: undefined,
      payload: undefined,
      getHeader: () => contentType,
      status(code: number) {
        reply.statusCode = code;
        return reply;
      },
      send(payload: any) {
        reply.payload = payload;
        return reply;
      }
    };
    return reply;
  };

  describe('errorHandler', () => {
    test('sends the status code and the error body of an HttpError', () => {
      const reply = createReply();

      errorHandler(new HttpError('Not found', 404), createRequest(), reply);

      expect(reply.statusCode).toBe(404);
      expect(reply.payload).toEqual({ errorCode: 404, message: 'Not found' });
    });

    test('uses the application error code when present', () => {
      const reply = createReply();

      errorHandler(
        new HttpError('Invalid', 400, undefined, 1001),
        createRequest(),
        reply
      );

      expect(reply.payload).toEqual({ errorCode: 1001, message: 'Invalid' });
    });

    test('defaults to a server error for an error without a status code', () => {
      const reply = createReply();

      errorHandler(new Error('boom') as any, createRequest(), reply);

      expect(reply.statusCode).toBe(500);
      expect(reply.payload).toEqual({ errorCode: 500, message: 'boom' });
    });

    test('falls back to an unknown error message', () => {
      const reply = createReply();

      errorHandler({ statusCode: 500 } as any, createRequest(), reply);

      expect(reply.payload).toEqual({
        errorCode: 500,
        message: 'Unknown error'
      });
    });

    test('logs the stack of a server error without a cause', () => {
      const request = createRequest();

      errorHandler(new Error('boom') as any, request, createReply());

      expect(request.log.error).toHaveBeenCalledWith(expect.any(String));
    });

    test('logs the cause of a server error', () => {
      const request = createRequest();
      const cause = new Error('db down');

      errorHandler(
        new HttpError('Query failed', 500, cause),
        request,
        createReply()
      );

      expect(request.log.error).toHaveBeenCalledWith(cause);
    });

    test('does not log client errors', () => {
      const request = createRequest();

      errorHandler(new HttpError('Invalid', 400), request, createReply());

      expect(request.log.error).not.toHaveBeenCalled();
    });

    test('sends only the message for non JSON responses', () => {
      const reply = createReply('text/csv');

      errorHandler(new HttpError('Export failed', 500), createRequest(), reply);

      expect(reply.payload).toBe('Export failed');
    });

    test('sends the error object for JSON responses', () => {
      const reply = createReply('application/json');

      errorHandler(new HttpError('Invalid', 400), createRequest(), reply);

      expect(reply.payload).toEqual({ errorCode: 400, message: 'Invalid' });
    });
  });
});
