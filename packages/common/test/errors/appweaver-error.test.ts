import { AppweaverError, isAppweaverError } from '../../errors/appweaver-error';
import {
  ApplicationError,
  ConfigurationError,
  RequestError
} from '../../errors/common-errors';
import { ErrorCode } from '../../errors/error-code';

describe('appweaver-error', () => {
  describe('AppweaverError', () => {
    test('carries the code, the module and the details', () => {
      const error = new RequestError(ErrorCode.ValidationFailed, 'Invalid', {
        errors: [{ field: 'name', rule: 'required', message: 'is required' }]
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppweaverError);
      expect(error.name).toBe('RequestError');
      expect(error.code).toBe(ErrorCode.ValidationFailed);
      expect(error.module).toBe('request');
      expect(error.message).toBe('Invalid');
      expect(error.details.errors).toHaveLength(1);
    });

    test('defaults the details to an empty object', () => {
      expect(
        new ConfigurationError(ErrorCode.ConfigurationInvalid, 'Invalid')
          .details
      ).toEqual({});
    });

    test('keeps the error cause', () => {
      const cause = new Error('db down');

      const error = new ApplicationError('APP_FAILED', 'Failed', {}, { cause });

      expect(error.cause).toBe(cause);
    });

    test('checks the code of the error', () => {
      const error: ApplicationError = new ApplicationError(
        'OUT_OF_STOCK',
        'Out of stock'
      );

      expect(error.is('OUT_OF_STOCK')).toBe(true);
      expect(error.is('OTHER')).toBe(false);
    });

    test('serializes to JSON with the message of its cause', () => {
      const error = new ApplicationError(
        'OUT_OF_STOCK',
        'Out of stock',
        { productId: 1 },
        { cause: new Error('reserved') }
      );

      expect(JSON.parse(JSON.stringify(error))).toEqual({
        name: 'ApplicationError',
        code: 'OUT_OF_STOCK',
        module: 'application',
        message: 'Out of stock',
        details: { productId: 1 },
        cause: 'reserved'
      });
    });
  });

  describe('isAppweaverError', () => {
    test('recognizes an AppweaverError', () => {
      expect(isAppweaverError(new ApplicationError('X', 'x'))).toBe(true);
    });

    test('recognizes an error shaped like one of another package copy', () => {
      const error = Object.assign(new Error('x'), {
        code: 'X',
        module: 'application',
        details: {}
      });

      expect(isAppweaverError(error)).toBe(true);
    });

    test('rejects other errors', () => {
      expect(isAppweaverError(new Error('x'))).toBe(false);
      expect(
        isAppweaverError(Object.assign(new Error('x'), { code: 'P2002' }))
      ).toBe(false);
      expect(isAppweaverError({ code: 'X', module: 'm', details: {} })).toBe(
        false
      );
    });
  });
});
