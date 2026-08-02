import { HttpError } from '../../errors/http-error';

describe('http-error', () => {
  describe('HttpError', () => {
    test('is an Error with the given message', () => {
      const error = new HttpError('Not found', 404);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
    });

    test('defaults to a bad request status code', () => {
      expect(new HttpError('Invalid').statusCode).toBe(400);
    });

    test('keeps the error cause and the application error code', () => {
      const cause = new Error('constraint violation');

      const error = new HttpError('Create failed', 500, cause, 1001);

      expect(error.error).toBe(cause);
      expect(error.errorCode).toBe(1001);
    });

    test('appends the cause message outside of production', () => {
      const error = new HttpError('Create failed', 500, new Error('db down'));

      expect(error.message).toContain('Create failed');
      expect(error.message).toContain('db down');
    });

    test('stringifies a non error cause', () => {
      const error = new HttpError('Create failed', 500, 'plain reason');

      expect(error.message).toContain('plain reason');
    });

    test('keeps the message unchanged without a cause', () => {
      expect(new HttpError('Create failed', 500).message).toBe('Create failed');
    });

    test('hides the cause message in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'prod';
      jest.resetModules();

      try {
        const { HttpError: ProdHttpError } =
          await import('../../errors/http-error');
        const error = new ProdHttpError('Create failed', 500, new Error('db'));

        expect(error.message).toBe('Create failed');
      } finally {
        process.env.NODE_ENV = originalEnv;
        jest.resetModules();
      }
    });
  });
});
