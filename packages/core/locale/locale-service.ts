import fs from 'node:fs';
import path from 'node:path';
import {
  config,
  ErrorCode,
  isLocaleTag,
  isPlainObject,
  isString,
  LIFECYCLE,
  logger,
  OnInit,
  toText
} from '@appweaver/common';
import { LocaleError } from './locale-error';
import { defaultTranslations } from './default-translations';

/** The flat translations of a locale, keyed by the translation key. */
export type Translations = Record<string, string>;

/** The values a translation interpolates by name, i.e. `{name}`. A numeric `count` also selects the plural form. */
export type TranslationParams = Record<string, unknown>;

export class LocaleService implements OnInit {
  static [LIFECYCLE] = true;

  /** @internal */
  private _files = new Map<string, Translations>();
  /** @internal */
  private readonly _registered = new Map<string, Translations>();
  /** @internal */
  private readonly _pluralRules = new Map<string, Intl.PluralRules>();
  /** @internal */
  private _loaded = false;

  /** The locale used when none is given, the `LOCALE_DEFAULT` config. */
  public get defaultLocale(): string {
    return normalizeLocale(config.LOCALE_DEFAULT) ?? 'en';
  }

  public onInit(): void {
    this.load();
  }

  /**
   * Translates a key into the given locale. The key is looked up in the locale, then in the locales it falls back
   * to (`de-AT` falls back to `de`, then to the default locale), and finally in the framework's own translations. A
   * numeric `count` parameter selects the plural form of the locale, a key suffixed with `_zero`, `_one`, `_two`,
   * `_few`, `_many` or `_other`, before the key itself. The `{name}` placeholders are replaced by the parameters.
   *
   * @param {string} key - The translation key, i.e. `emails.passwordReset.subject`.
   * @param {string} [locale] - The locale to translate into. Defaults to the `LOCALE_DEFAULT` config.
   * @param {TranslationParams} [params] - The values of the placeholders.
   * @return {string} The translation, or the key itself when no locale translates it.
   */
  public translate(
    key: string,
    locale?: string,
    params?: TranslationParams
  ): string {
    const translation = this.findTranslation(key, locale, params?.count);
    if (translation === undefined) {
      logger.debug({ key, locale }, 'Translation missing');
      return key;
    }

    return params ? interpolate(translation, params) : translation;
  }

  /**
   * Tells whether a key is translated in the given locale or the locales it falls back to.
   *
   * @param {string} key - The translation key.
   * @param {string} [locale] - The locale. Defaults to the `LOCALE_DEFAULT` config.
   * @return {boolean} `true` if a translation exists, otherwise `false`.
   */
  public hasTranslation(key: string, locale?: string): boolean {
    return this.findTranslation(key, locale) !== undefined;
  }

  /**
   * Returns the locales the application has translations for, from the translation files and the registered ones.
   *
   * @return {string[]} The locale tags, i.e. `['de', 'en']`.
   */
  public getLocales(): string[] {
    this.load();
    return [...new Set([...this._files.keys(), ...this._registered.keys()])]
      .filter((locale) => locale)
      .sort();
  }

  /**
   * Returns the locales to look a translation or template up in, from the most specific one: the locale, the locales
   * it falls back to by removing its subtags, then the default locale and its fallbacks. An invalid locale is skipped.
   *
   * @param {string} [locale] - The requested locale, i.e. `de-AT`.
   * @return {string[]} The locale chain, i.e. `['de-AT', 'de', 'en']`.
   */
  public resolveLocales(locale?: string): string[] {
    const chain: string[] = [];

    for (const tag of [normalizeLocale(locale), this.defaultLocale]) {
      const subtags = tag?.split('-') ?? [];
      for (let i = subtags.length; i > 0; i--) {
        const candidate = subtags.slice(0, i).join('-');
        if (!chain.includes(candidate)) {
          chain.push(candidate);
        }
      }
    }

    return chain;
  }

  /**
   * Registers the translations of a locale, merged over the translations of its file and the earlier registered ones.
   *
   * @param {string} locale - The locale, i.e. `de`.
   * @param {Translations} translations - The flat translations, keyed by the translation key.
   */
  public addTranslations(locale: string, translations: Translations): void {
    const tag = normalizeLocale(locale);
    if (!tag) {
      logger.warn({ locale }, 'Translations of an invalid locale ignored');
      return;
    }
    this._registered.set(tag, {
      ...this._registered.get(tag),
      ...flatTranslations(translations, tag)
    });
  }

  /**
   * Reads the translation files of the `LOCALE_PATH` directory again.
   *
   * @throws {LocaleError} `LOCALE_LOAD_FAILED` if a translation file cannot be read or parsed.
   */
  public reload(): void {
    this._loaded = false;
    this.load();
  }

  /** @internal */
  private load(): void {
    if (this._loaded) {
      return;
    }

    const dir = path.resolve(process.cwd(), config.LOCALE_PATH);
    const files = new Map<string, Translations>();

    let fileNames: string[] = [];
    try {
      fileNames = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      logger.debug({ dir }, 'Locale directory not found');
    }

    for (const fileName of fileNames) {
      const filePath = path.join(dir, fileName);
      const locale = normalizeLocale(fileName.slice(0, -'.json'.length));
      if (!locale) {
        logger.warn({ filePath }, 'Translation file of an invalid locale');
        continue;
      }

      let translations: unknown;
      try {
        translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        throw new LocaleError(
          ErrorCode.LocaleLoadFailed,
          `Translation file '${filePath}' loading failed`,
          { path: filePath },
          { cause: e }
        );
      }

      if (!isPlainObject(translations)) {
        throw new LocaleError(
          ErrorCode.LocaleLoadFailed,
          `Translation file '${filePath}' must contain a JSON object`,
          { path: filePath }
        );
      }

      files.set(locale, flatTranslations(translations, locale));
    }

    this._files = files;
    this._loaded = true;
  }

  /** @internal */
  private findTranslation(
    key: string,
    locale?: string,
    count?: unknown
  ): string | undefined {
    this.load();

    const chain = this.resolveLocales(locale);

    for (const tag of chain) {
      const sources = [this._registered.get(tag), this._files.get(tag)];
      // Only the locales with translations select a plural form, so the
      // plural rules are kept for a bounded set of locales
      if (sources.every((translations) => !translations)) {
        continue;
      }
      const value = findValue(sources, this.pluralKeys(key, tag, count));
      if (value !== undefined) {
        return value;
      }
    }

    return findValue([defaultTranslations], this.pluralKeys(key, 'en', count));
  }

  /** @internal */
  private pluralKeys(key: string, locale: string, count: unknown): string[] {
    if (typeof count !== 'number') {
      return [key];
    }

    let rules = this._pluralRules.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      this._pluralRules.set(locale, rules);
    }

    const keys = [`${key}_${rules.select(count)}`, `${key}_other`, key];
    if (count === 0) {
      keys.unshift(`${key}_zero`);
    }
    return [...new Set(keys)];
  }
}

/**
 * Normalizes a locale tag into its canonical form, i.e. `de_at` into `de-AT`.
 *
 * @return The canonical locale tag, or `undefined` if the value is not a supported locale.
 */
function normalizeLocale(locale?: string): string | undefined {
  if (!locale) {
    return undefined;
  }
  const tag = locale.trim().replace(/_/g, '-');
  if (!isLocaleTag(tag)) {
    return undefined;
  }
  return Intl.getCanonicalLocales(tag)[0];
}

/** Returns the first of the keys translated by the first of the translations defining it. */
function findValue(
  sources: (Translations | undefined)[],
  keys: string[]
): string | undefined {
  for (const translations of sources) {
    for (const key of keys) {
      if (translations && Object.hasOwn(translations, key)) {
        return translations[key];
      }
    }
  }
  return undefined;
}

/** Keeps the string values of flat translations, warning about the rest. */
function flatTranslations(
  translations: Record<string, unknown>,
  locale: string
): Translations {
  const result: Translations = {};
  for (const [key, value] of Object.entries(translations)) {
    if (isString(value)) {
      result[key] = value;
    } else {
      logger.warn(
        { locale, key },
        'Translation ignored, the translations must be flat string values'
      );
    }
  }
  return result;
}

/** Replaces the `{name}` placeholders with the parameters, keeping the ones without a value. */
function interpolate(translation: string, params: TranslationParams): string {
  return translation.replace(/\{\s*([\w.-]+)\s*\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : toText(value);
  });
}
