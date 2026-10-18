jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  const configOverrides: Record<string, unknown> = {};
  return {
    __esModule: true,
    ...actual,
    configOverrides,
    get config() {
      return { ...actual.config, ...configOverrides };
    }
  };
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as common from '@appweaver/common';
import { ErrorCode, logger } from '@appweaver/common';
import { LocaleService } from '../../locale';

const { configOverrides } = common as unknown as {
  configOverrides: Record<string, unknown>;
};

describe('locale-service', () => {
  let dir: string;
  let service: LocaleService;

  const writeLocale = (locale: string, content: unknown) =>
    fs.writeFileSync(
      path.join(dir, `${locale}.json`),
      typeof content === 'string' ? content : JSON.stringify(content)
    );

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-locales-'));
    configOverrides.LOCALE_PATH = dir;
    configOverrides.LOCALE_DEFAULT = 'en';
    writeLocale('en', {
      greeting: 'Hello {name}',
      cart: {
        items: '{count, plural, =0 {No items} one {# item} other {# items}}'
      },
      onlyEnglish: 'English only'
    });
    writeLocale('de', {
      greeting: 'Hallo {name}',
      cart: { items: '{count, plural, one {# Artikel} other {# Artikel}}' }
    });
    writeLocale('de-AT', { greeting: 'Servus {name}' });
    service = new LocaleService();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('translate', () => {
    test('translates a key into the default locale', () => {
      expect(service.translate('greeting', undefined, { name: 'Ana' })).toBe(
        'Hello Ana'
      );
    });

    test('translates a key into the given locale', () => {
      expect(service.translate('greeting', 'de', { name: 'Ana' })).toBe(
        'Hallo Ana'
      );
    });

    test('prefers the most specific locale', () => {
      expect(service.translate('greeting', 'de-AT', { name: 'Ana' })).toBe(
        'Servus Ana'
      );
      expect(service.translate('greeting', 'de_at', { name: 'Ana' })).toBe(
        'Servus Ana'
      );
    });

    test('falls back to the language and the default locale', () => {
      expect(service.translate('cart.items', 'de-AT', { count: 2 })).toBe(
        '2 Artikel'
      );
      expect(service.translate('onlyEnglish', 'de-AT')).toBe('English only');
    });

    test('falls back to the default locale for an unknown locale', () => {
      expect(service.translate('greeting', 'xx-invalid-tag-', {})).toBe(
        'Hello {name}'
      );
    });

    test('selects the plural form by the count', () => {
      expect(service.translate('cart.items', 'en', { count: 1 })).toBe(
        '1 item'
      );
      expect(service.translate('cart.items', 'en', { count: 5 })).toBe(
        '5 items'
      );
      expect(service.translate('cart.items', 'en', { count: 0 })).toBe(
        'No items'
      );
    });

    test('keeps the placeholders without a value', () => {
      expect(service.translate('greeting')).toBe('Hello {name}');
    });

    test('returns the key of a missing translation', () => {
      expect(service.translate('missing.key', 'de')).toBe('missing.key');
    });

    test('ignores the inherited object properties', () => {
      expect(service.translate('constructor', 'de')).toBe('constructor');
      expect(service.hasTranslation('toString')).toBe(false);
    });

    test('formats an ICU message with the plural form of any argument', () => {
      writeLocale('hr', {
        inbox: {
          unread:
            'Imate {msg_cnt, plural, =0 {nijednu nepročitanu poruku} one {# nepročitanu poruku} few {# nepročitane poruke} other {# nepročitanih poruka}}'
        }
      });
      service.addTranslations('en', {
        inbox: {
          unread:
            'You have {msg_cnt, plural, =0 {no unread messages} one {# unread message} other {# unread messages}}',
          title: '{name}, you have {msg_cnt} new messages'
        }
      });
      service.reload();

      const unread = (msg_cnt: number, locale = 'en') =>
        service.translate('inbox.unread', locale, { msg_cnt });

      expect(unread(0)).toBe('You have no unread messages');
      expect(unread(1)).toBe('You have 1 unread message');
      expect(unread(7)).toBe('You have 7 unread messages');
      expect(unread(1, 'hr')).toBe('Imate 1 nepročitanu poruku');
      expect(unread(3, 'hr')).toBe('Imate 3 nepročitane poruke');
      expect(unread(5, 'hr')).toBe('Imate 5 nepročitanih poruka');
      expect(
        service.translate('inbox.title', 'en', { name: 'Ana', msg_cnt: 2 })
      ).toBe('Ana, you have 2 new messages');
    });

    test('selects the plural form by the locale the translation is found in', () => {
      service.addTranslations('en', {
        files: '{n, plural, one {# file} few {# files (few)} other {# files}}'
      });

      // The Croatian "few" category does not exist in English
      expect(service.translate('files', 'hr', { n: 3 })).toBe('3 files');
    });

    test('falls back to the framework translations', () => {
      expect(service.translate('emails.passwordReset.subject', 'de')).toBe(
        'Password reset request'
      );
    });

    test('lets a translation file override a framework translation', () => {
      writeLocale('hr', {
        emails: { passwordReset: { subject: 'Nova lozinka' } }
      });
      service.reload();

      expect(service.translate('emails.passwordReset.subject', 'hr')).toBe(
        'Nova lozinka'
      );
    });
  });

  describe('hasTranslation', () => {
    test('tells whether a key is translated', () => {
      expect(service.hasTranslation('greeting', 'de')).toBe(true);
      expect(service.hasTranslation('missing.key', 'de')).toBe(false);
    });
  });

  describe('getLocales', () => {
    test('lists the locales of the files and the registered translations', () => {
      service.addTranslations('fr', { greeting: 'Bonjour {name}' });

      expect(service.getLocales()).toEqual(['de', 'de-AT', 'en', 'fr']);
    });
  });

  describe('resolveLocales', () => {
    test('returns the locale chain ending with the default locale', () => {
      expect(service.resolveLocales('de-AT')).toEqual(['de-AT', 'de', 'en']);
      expect(service.resolveLocales()).toEqual(['en']);
    });

    test('follows the default locale configured', () => {
      configOverrides.LOCALE_DEFAULT = 'de-CH';

      expect(service.resolveLocales('hr')).toEqual(['hr', 'de-CH', 'de']);
    });
  });

  describe('addTranslations', () => {
    test('rejects a translation that is not a valid message', () => {
      expect(() =>
        service.addTranslations('de', { broken: 'Hallo {name' })
      ).toThrow(expect.objectContaining({ code: ErrorCode.LocaleLoadFailed }));
    });

    test('merges the translations over the translation file', () => {
      service.addTranslations('de', {
        greeting: 'Guten Tag {name}',
        cart: { checkout: 'Zur Kasse' }
      });

      expect(service.translate('greeting', 'de', { name: 'Ana' })).toBe(
        'Guten Tag Ana'
      );
      expect(service.translate('cart.items', 'de', { count: 1 })).toBe(
        '1 Artikel'
      );
      expect(service.translate('cart.checkout', 'de')).toBe('Zur Kasse');
    });

    test('ignores the translations of an invalid locale', () => {
      jest.spyOn(logger, 'warn').mockImplementation();

      service.addTranslations('not a locale', { greeting: 'x' });

      expect(service.getLocales()).toEqual(['de', 'de-AT', 'en']);
    });
  });

  describe('loading', () => {
    test('flattens the nested translations into dotted keys', () => {
      writeLocale('hr', {
        page: { title: 'Naslov', footer: { copyright: 'Sva prava pridržana' } }
      });

      service.reload();

      expect(service.translate('page.title', 'hr')).toBe('Naslov');
      expect(service.translate('page.footer.copyright', 'hr')).toBe(
        'Sva prava pridržana'
      );
      expect(service.hasTranslation('page', 'hr')).toBe(false);
    });

    test('ignores the values that are neither strings nor objects', () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      writeLocale('hr', { count: 3, list: ['a'], page: { title: 'Naslov' } });

      service.reload();

      expect(service.translate('page.title', 'hr')).toBe('Naslov');
      expect(service.hasTranslation('count', 'hr')).toBe(false);
      expect(service.hasTranslation('list', 'hr')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    test('names the dotted key of an invalid nested message', () => {
      writeLocale('hr', { page: { title: 'Naslov {name' } });

      expect(() => service.reload()).toThrow(/'page\.title'/);
    });

    test('ignores a file not named by a locale', () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      writeLocale('messages', { greeting: 'x' });

      service.reload();

      expect(service.getLocales()).toEqual(['de', 'de-AT', 'en']);
      expect(warn).toHaveBeenCalled();
    });

    test('fails on a translation that is not a valid message', () => {
      writeLocale('hr', { broken: 'Imate {n, plural, one {# poruku}}' });

      expect(() => service.reload()).toThrow(
        expect.objectContaining({
          code: ErrorCode.LocaleLoadFailed,
          message: expect.stringContaining(
            "Translation 'broken' of " + path.join(dir, 'hr.json')
          )
        })
      );
    });

    test('fails on a file that is not valid JSON', () => {
      writeLocale('hr', '{ invalid');

      expect(() => service.reload()).toThrow(
        expect.objectContaining({ code: ErrorCode.LocaleLoadFailed })
      );
    });

    test('fails on a file that is not a JSON object', () => {
      writeLocale('hr', '["a"]');

      expect(() => service.onInit()).toThrow(
        expect.objectContaining({ code: ErrorCode.LocaleLoadFailed })
      );
    });

    test('has no translations without the locale directory', () => {
      configOverrides.LOCALE_PATH = path.join(dir, 'missing');
      service = new LocaleService();

      expect(service.getLocales()).toEqual([]);
      expect(service.translate('greeting')).toBe('greeting');
    });
  });
});
