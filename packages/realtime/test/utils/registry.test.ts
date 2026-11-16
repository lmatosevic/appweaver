import { ErrorCode } from '@appweaver/common';
import { resetContext } from '@appweaver/testing';
import { createRegistry } from '../../utils/registry';

describe('registry', () => {
  describe('createRegistry', () => {
    const key = Symbol('test-registry');

    beforeEach(() => {
      resetContext();
    });

    test('adds, lists and finds the items', () => {
      const registry = createRegistry<{ name: string }>(key, 'item');
      const item = registry.add({ name: 'a.b' });

      expect(registry.all()).toEqual([item]);
      expect(registry.find('a.b')).toBe(item);
      expect(registry.find('c')).toBeUndefined();
    });

    test('refuses a name of the pattern or of the kind', () => {
      const registry = createRegistry<{ name: string }>(key, 'item', (name) =>
        name.startsWith('x')
      );

      for (const name of ['', 'a b', 'xy']) {
        expect(() => registry.add({ name })).toThrow(
          expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
        );
      }
    });

    test('refuses a name already taken', () => {
      const registry = createRegistry<{ name: string }>(key, 'item');
      registry.add({ name: 'a' });

      expect(() => registry.add({ name: 'a' })).toThrow(
        "Realtime item 'a' is already defined"
      );
    });
  });
});
