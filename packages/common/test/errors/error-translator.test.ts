import { ErrorCode } from '../../errors/error-code';
import { DatabaseError } from '../../errors/module-errors';
import {
  defineErrorTranslator,
  findErrorTranslator,
  translateError
} from '../../errors/error-translator';

class LibraryError extends Error {}

describe('error-translator', () => {
  beforeAll(() => {
    defineErrorTranslator({
      name: 'library',
      matches: (error) => error instanceof LibraryError,
      translate: (error) =>
        new DatabaseError(
          ErrorCode.DatabaseUnavailable,
          (error as Error).message
        )
    });
  });

  describe('findErrorTranslator', () => {
    test('finds the translator matching an error', () => {
      expect(findErrorTranslator(new LibraryError('down'))?.name).toBe(
        'library'
      );
    });

    test('returns undefined for an error no translator matches', () => {
      expect(findErrorTranslator(new Error('other'))).toBeUndefined();
    });
  });

  describe('translateError', () => {
    test('converts an error of a library into a framework error', () => {
      const translated = translateError(new LibraryError('down'));

      expect(translated).toBeInstanceOf(DatabaseError);
      expect((translated as DatabaseError).message).toBe('down');
    });

    test('leaves any other error as it is', () => {
      const error = new Error('other');

      expect(translateError(error)).toBe(error);
    });
  });

  describe('defineErrorTranslator', () => {
    test('replaces the translator of the same name', () => {
      defineErrorTranslator({
        name: 'replaced',
        matches: (error) => error === 'first',
        translate: () => new DatabaseError(ErrorCode.DatabaseUnavailable, '')
      });
      defineErrorTranslator({
        name: 'replaced',
        matches: (error) => error === 'second',
        translate: () => new DatabaseError(ErrorCode.DatabaseUnavailable, '')
      });

      expect(findErrorTranslator('first')).toBeUndefined();
      expect(findErrorTranslator('second')?.name).toBe('replaced');
    });
  });
});
