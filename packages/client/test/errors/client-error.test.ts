import { ClientError } from '../../errors/client-error';

describe('client-error', () => {
  describe('ClientError', () => {
    test('is an Error with the given message', () => {
      const error = new ClientError('Not found', 404);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Not found');
      expect(error.errorCode).toBe(404);
    });

    test('keeps the response and the error data', () => {
      const response = new Response(null, { status: 400 });
      const data = { message: 'Invalid', fields: ['title'] };

      const error = new ClientError('Invalid', 400, response, data);

      expect(error.response).toBe(response);
      expect(error.data).toBe(data);
    });

    test('leaves the response and data undefined when not provided', () => {
      const error = new ClientError('Unknown error', 500);

      expect(error.response).toBeUndefined();
      expect(error.data).toBeUndefined();
    });

    test('is catchable as a ClientError', () => {
      const throwing = () => {
        throw new ClientError('Boom', 500);
      };

      expect(throwing).toThrow(ClientError);
      expect(throwing).toThrow('Boom');
      expect(throwing).toThrow(expect.objectContaining({ errorCode: 500 }));
    });
  });
});
