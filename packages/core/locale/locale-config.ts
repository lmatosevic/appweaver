import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const localeConfig = defineConfig('locale', {
  /** The locale used when none is given to a translation or a template render. Default: `'en'`. */
  DEFAULT: Type.String({ default: 'en' }),
  /** Directory of the translation files, a nested JSON file per locale, i.e. `de.json`. Default: `'./locales'`. */
  PATH: Type.String({ default: './locales' })
});
