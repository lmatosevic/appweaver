import { Storage } from '../../infrastructure';
import { defineModule, isModule } from '../../module/define-module';

describe('define-module', () => {
  describe('defineModule', () => {
    test('returns the frozen manifest', () => {
      const module = defineModule({
        name: '@acme/appweaver-gcs',
        providers: [
          { contract: Storage, name: 'gcs', load: () => ({ GcsStorage: {} }) }
        ]
      });

      expect(module.name).toBe('@acme/appweaver-gcs');
      expect(module.providers?.[0].name).toBe('gcs');
      expect(Object.isFrozen(module)).toBe(true);
    });
  });

  describe('isModule', () => {
    test('tells a manifest apart from any other value', () => {
      expect(isModule(defineModule({ name: 'billing' }))).toBe(true);
      expect(isModule({ name: 'billing' })).toBe(false);
      expect(isModule(null)).toBe(false);
    });
  });
});
