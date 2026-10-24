import { define } from '../../context/dependency-injection';
import { LocaleService } from '../../locale/locale-service';
import { registerTranslations } from '../../locale';
import { resetContext } from '../fixtures/context-fixture';

describe('register-translations', () => {
  afterAll(() => {
    resetContext();
  });

  describe('registerTranslations', () => {
    test('adds the translations to the locale service', () => {
      resetContext();
      const addTranslations = jest.fn();
      define({ addTranslations }, LocaleService);

      registerTranslations('de', { greeting: 'Hallo' });

      expect(addTranslations).toHaveBeenCalledWith('de', { greeting: 'Hallo' });
    });
  });
});
