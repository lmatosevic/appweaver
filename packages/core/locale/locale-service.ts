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
  OnInit
} from '@appweaver/common';
import { LocaleError } from './locale-error';
import { defaultTranslations } from './default-translations';
import { formatMessage, parseMessage } from './utils/message-format';

/** The flat translations of a locale, keyed by the translation key. */
export type Translations = Record<string, string>;

/** The values of the arguments of a translation, i.e. `{name}` or `{count, plural, one {# item} other {# items}}`. */
export type TranslationParams = Record<string, unknown>;

export class LocaleService implements OnInit {
  static [LIFECYCLE] = true;

  /** @internal */
  private _files = new Map<string, Translations>();
  /** @internal */
  private readonly _registered = new Map<string, Translations>();
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
   * Translates a key into the locale, looked up along {@link resolveLocales} and then in the framework's own
   * translations. The translation is an ICU message (see `MessagePart`), and an argument without a parameter is
   * written as it is.
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
    const translation = this.findTranslation(key, locale);
    if (translation === undefined) {
      logger.debug({ key, locale }, 'Translation missing');
      return key;
    }

    return formatMessage(translation.value, params ?? {}, translation.locale);
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
   * @throws {LocaleError} `LOCALE_LOAD_FAILED` if a translation is not a valid message.
   */
  public addTranslations(locale: string, translations: Translations): void {
    const tag = normalizeLocale(locale);
    if (!tag) {
      logger.warn({ locale }, 'Translations of an invalid locale ignored');
      return;
    }
    this._registered.set(tag, {
      ...this._registered.get(tag),
      ...flatTranslations(translations, tag, `registered '${tag}'`)
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

      files.set(locale, flatTranslations(translations, locale, filePath));
    }

    this._files = files;
    this._loaded = true;
  }

  /** @internal */
  private findTranslation(
    key: string,
    locale?: string
  ): { value: string; locale: string } | undefined {
    this.load();

    for (const tag of this.resolveLocales(locale)) {
      for (const translations of [
        this._registered.get(tag),
        this._files.get(tag)
      ]) {
        if (translations && Object.hasOwn(translations, key)) {
          return { value: translations[key], locale: tag };
        }
      }
    }

    return Object.hasOwn(defaultTranslations, key)
      ? { value: defaultTranslations[key], locale: 'en' }
      : undefined;
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

/** Keeps the string values of flat translations, warning about the rest, and failing on an invalid message. */
function flatTranslations(
  translations: Record<string, unknown>,
  locale: string,
  source: string
): Translations {
  const result: Translations = {};
  for (const [key, value] of Object.entries(translations)) {
    if (isString(value)) {
      try {
        parseMessage(value);
      } catch (e) {
        throw new LocaleError(
          ErrorCode.LocaleLoadFailed,
          `Translation '${key}' of ${source} is invalid: ${(e as Error).message}`,
          { path: source },
          { cause: e }
        );
      }
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
