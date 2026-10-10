import {
  ClientError,
  isClientError,
  REQUEST_FAILED_CODE
} from '../../errors/client-error';

const problem = {
  type: 'urn:appweaver:error:database-unique-violation',
  title: 'Unique constraint violation',
  status: 409,
  code: 'DATABASE_UNIQUE_VIOLATION',
  detail: 'User with the same email already exists',
  errors: [{ field: 'email', rule: 'unique', message: 'must be unique' }],
  details: { model: 'User', fields: ['email'] }
};

describe('client-error', () => {
  describe('ClientError', () => {
    test('is an Error with the given message and status', () => {
      const error = new ClientError('Not found', { status: 404 });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ClientError');
      expect(error.message).toBe('Not found');
      expect(error.status).toBe(404);
    });

    test('reads the code, field errors and details of the problem details', () => {
      const error = new ClientError(problem.detail, {
        status: 409,
        data: problem
      });

      expect(error.code).toBe('DATABASE_UNIQUE_VIOLATION');
      expect(error.problem).toBe(problem);
      expect(error.errors).toEqual(problem.errors);
      expect(error.details).toEqual(problem.details);
    });

    test('falls back to the request failed code without problem details', () => {
      const error = new ClientError('Bad gateway', {
        status: 502,
        data: 'html'
      });

      expect(error.code).toBe(REQUEST_FAILED_CODE);
      expect(error.problem).toBeUndefined();
      expect(error.errors).toEqual([]);
      expect(error.details).toEqual({});
    });

    test('keeps the response and the error data', () => {
      const response = new Response(null, { status: 400 });
      const data = { message: 'Invalid', fields: ['title'] };

      const error = new ClientError('Invalid', { status: 400, response, data });

      expect(error.response).toBe(response);
      expect(error.data).toBe(data);
    });

    test('checks the code of the error', () => {
      const error = new ClientError(problem.detail, {
        status: 409,
        data: problem
      });

      expect(error.is('DATABASE_UNIQUE_VIOLATION')).toBe(true);
      expect(error.is('RESOURCE_NOT_FOUND')).toBe(false);
    });

    test('is catchable as a ClientError', () => {
      const throwing = () => {
        throw new ClientError('Boom', { status: 500 });
      };

      expect(throwing).toThrow(ClientError);
      expect(throwing).toThrow('Boom');
      expect(throwing).toThrow(expect.objectContaining({ status: 500 }));
    });
  });

  describe('fromResponse', () => {
    test('uses the detail of the problem details as the message', () => {
      const response = new Response(null, { status: 409 });

      const error = ClientError.fromResponse(problem, response);

      expect(error).toMatchObject({
        message: problem.detail,
        status: 409,
        code: 'DATABASE_UNIQUE_VIOLATION',
        response,
        data: problem
      });
    });

    test('falls back to the message of another body and the status text', () => {
      const response = new Response(null, {
        status: 500,
        statusText: 'Server Error'
      });

      expect(
        ClientError.fromResponse({ message: 'Boom' }, response).message
      ).toBe('Boom');
      expect(ClientError.fromResponse({}, response).message).toBe(
        'Server Error'
      );
      expect(
        ClientError.fromResponse(undefined, new Response(null, { status: 500 }))
          .message
      ).toBe('Unknown error');
    });
  });

  describe('fromResponse route', () => {
    test('keeps the route of the request with a lower case method', () => {
      const error = ClientError.fromResponse(
        problem,
        new Response(null, { status: 409 }),
        { method: 'POST', path: '/api/users' }
      );

      expect(error.route).toEqual({ method: 'post', path: '/api/users' });
    });
  });

  describe('isClientError', () => {
    test('recognizes a ClientError', () => {
      expect(isClientError(new ClientError('Boom', { status: 500 }))).toBe(
        true
      );
    });

    test('rejects other errors', () => {
      expect(isClientError(new Error('Boom'))).toBe(false);
      expect(isClientError({ code: 'X', status: 500 })).toBe(false);
    });
  });
});
