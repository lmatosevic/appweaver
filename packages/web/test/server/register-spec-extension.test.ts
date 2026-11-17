import { resetContext } from '@appweaver/testing';
import {
  addSpecExtensions,
  registerSpecExtension
} from '../../server/register-spec-extension';

describe('register-spec-extension', () => {
  beforeEach(() => {
    resetContext();
  });

  describe('registerSpecExtension', () => {
    test('adds the extension to the documents', () => {
      const build = jest.fn(() => ({ channels: [] }));
      registerSpecExtension('realtime', build);

      expect(addSpecExtensions({ openapi: '3.0.3' })).toEqual({
        openapi: '3.0.3',
        'x-appweaver-realtime': { channels: [] }
      });
      expect(build).toHaveBeenCalledTimes(1);
    });
  });

  describe('addSpecExtensions', () => {
    test('leaves a document without extensions unchanged', () => {
      expect(addSpecExtensions({ openapi: '3.0.3' })).toEqual({
        openapi: '3.0.3'
      });
    });
  });
});
