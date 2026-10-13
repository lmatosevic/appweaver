import { inject } from '../context';
import { LocaleService, Translations } from './locale-service';

/**
 * Registers the translations of a locale in code, merged over the translations of its file in `LOCALE_PATH`.
 *
 * @param {string} locale - The locale, i.e. `de`.
 * @param {Translations} translations - The flat translations, keyed by the translation key.
 */
export function registerTranslations(
  locale: string,
  translations: Translations
): void {
  inject(LocaleService).addTranslations(locale, translations);
}
