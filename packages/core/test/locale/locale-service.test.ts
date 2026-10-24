import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as common from '@appweaver/common';
import { defineModule, ErrorCode, logger } from '@appweaver/common';
import { context } from '../../context/context';
import { LocaleService } from '../../locale/locale-service';

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
    context.modules.enabled.length = 0;
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
      writeLocale('es', {
        inbox: {
          unread:
            'Tienes {msg_cnt, plural, =0 {ningún mensaje sin leer} one {# mensaje sin leer} many {# de mensajes sin leer} other {# mensajes sin leer}}'
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
      expect(unread(1, 'es')).toBe('Tienes 1 mensaje sin leer');
      expect(unread(5, 'es')).toBe('Tienes 5 mensajes sin leer');
      expect(unread(1_000_000, 'es')).toBe(
        'Tienes 1.000.000 de mensajes sin leer'
      );
      expect(
        service.translate('inbox.title', 'en', { name: 'Ana', msg_cnt: 2 })
      ).toBe('Ana, you have 2 new messages');
    });

    test('selects the plural form by the locale the translation is found in', () => {
      service.addTranslations('en', {
        files: '{n, plural, one {# file} many {# files (many)} other {# files}}'
      });

      // The Spanish "many" category does not exist in English
      expect(service.translate('files', 'es', { n: 1_000_000 })).toBe(
        '1,000,000 files'
      );
    });

    test('falls back to the framework translations', () => {
      expect(service.translate('emails.passwordReset.subject', 'de')).toBe(
        'Password reset request'
      );
    });

    test('lets a translation file override a framework translation', () => {
      writeLocale('es', {
        emails: { passwordReset: { subject: 'Nueva contraseña' } }
      });
      service.reload();

      expect(service.translate('emails.passwordReset.subject', 'es')).toBe(
        'Nueva contraseña'
      );
    });

    test('reads the translations of the modules, overridden by the application', () => {
      const moduleDir = fs.mkdtempSync(path.join(dir, 'module-'));
      fs.writeFileSync(
        path.join(moduleDir, 'en.json'),
        JSON.stringify({ greeting: 'Hi {name}', newsletter: 'Subscribe' })
      );
      context.modules.enabled.push(
        defineModule({ name: 'newsletter', locales: moduleDir })
      );
      service.reload();

      expect(service.translate('newsletter')).toBe('Subscribe');
      expect(service.translate('greeting', 'en', { name: 'Ana' })).toBe(
        'Hello Ana'
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

      expect(service.resolveLocales('es')).toEqual(['es', 'de-CH', 'de']);
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
      writeLocale('es', {
        page: {
          title: 'Título',
          footer: { copyright: 'Todos los derechos reservados' }
        }
      });

      service.reload();

      expect(service.translate('page.title', 'es')).toBe('Título');
      expect(service.translate('page.footer.copyright', 'es')).toBe(
        'Todos los derechos reservados'
      );
      expect(service.hasTranslation('page', 'es')).toBe(false);
    });

    test('ignores the values that are neither strings nor objects', () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      writeLocale('es', { count: 3, list: ['a'], page: { title: 'Título' } });

      service.reload();

      expect(service.translate('page.title', 'es')).toBe('Título');
      expect(service.hasTranslation('count', 'es')).toBe(false);
      expect(service.hasTranslation('list', 'es')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    test('names the dotted key of an invalid nested message', () => {
      writeLocale('es', { page: { title: 'Título {name' } });

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
      writeLocale('es', { broken: 'Tienes {n, plural, one {# mensaje}}' });

      expect(() => service.reload()).toThrow(
        expect.objectContaining({
          code: ErrorCode.LocaleLoadFailed,
          message: expect.stringContaining(
            "Translation 'broken' of " + path.join(dir, 'es.json')
          )
        })
      );
    });

    test('fails on a file that is not valid JSON', () => {
      writeLocale('es', '{ invalid');

      expect(() => service.reload()).toThrow(
        expect.objectContaining({ code: ErrorCode.LocaleLoadFailed })
      );
    });

    test('fails on a file that is not a JSON object', () => {
      writeLocale('es', '["a"]');

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
