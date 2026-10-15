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
import { ErrorCode } from '@appweaver/common';
import { define } from '../../context';
import { LocaleService } from '../../locale';
import { HandlebarsTemplateEngine } from '../../template/handlebars-template-engine';
import { resetContext } from '../fixtures/context-fixture';

const { configOverrides } = common as unknown as {
  configOverrides: Record<string, unknown>;
};

describe('handlebars-template-engine', () => {
  let dir: string;
  let engine: HandlebarsTemplateEngine;

  const writeFile = (relativePath: string, content: string) => {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-templates-'));
    Object.assign(configOverrides, {
      TEMPLATE_PATH: path.join(dir, 'templates'),
      TEMPLATE_CACHE: true,
      LOCALE_PATH: path.join(dir, 'locales'),
      LOCALE_DEFAULT: 'en',
      APP_NAME: 'Test App'
    });

    writeFile(
      'locales/en.json',
      JSON.stringify({ greeting: 'Hello {name}', notice: 'Notice' })
    );
    writeFile(
      'locales/de.json',
      JSON.stringify({ greeting: 'Hallo {name}', notice: 'Hinweis' })
    );

    writeFile(
      'templates/layouts/base.html.hbs',
      '<html lang="{{@locale}}">{{> @partial-block}}</html>'
    );
    writeFile(
      'templates/partials/button.html.hbs',
      '<a href="{{href}}">{{label}}</a>'
    );
    writeFile('templates/partials/button.txt.hbs', '{{label}}: {{href}}');
    writeFile('templates/partials/notice.html.hbs', '<em>{{t "notice"}}</em>');
    writeFile('templates/partials/notice.de.html.hbs', '<em>Achtung</em>');
    writeFile(
      'templates/pages/greeting.html.hbs',
      '{{#> layouts/base.html}}<p>{{t "greeting" name=name}}</p>' +
        '{{> partials/button href=link label="Go"}}{{> partials/notice}}{{/layouts/base.html}}'
    );
    writeFile(
      'templates/pages/greeting.txt.hbs',
      '{{t "greeting" name=name}} {{> partials/button href=link label="Go"}}'
    );
    writeFile('templates/pages/legal.html.hbs', 'Terms');
    writeFile('templates/pages/legal.de.html.hbs', 'Bedingungen');
    writeFile('templates/pages/only-german.de.html.hbs', 'Nur Deutsch');
    writeFile(
      'templates/exports/products.xml.hbs',
      '<products>{{#each items}}<product id="{{id}}"><name>{{name}}</name>' +
        '<description>{{cdata description}}</description></product>{{/each}}</products>'
    );
    writeFile(
      'templates/exports/products.csv.hbs',
      '{{#each items}}{{name}};{{formatNumber price minimumFractionDigits=2}}\n{{/each}}'
    );
    writeFile(
      'templates/feeds/posts.rss.xml.handlebars',
      '<rss><title>{{@app.name}}</title></rss>'
    );
    writeFile('templates/README.md', '# Not a template');

    resetContext();
    define(LocaleService);
    engine = new HandlebarsTemplateEngine();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  afterAll(() => {
    resetContext();
  });

  describe('render', () => {
    test('renders a template with its layout and partials', async () => {
      const html = await engine.render('pages/greeting.html', {
        name: 'Ana',
        link: 'https://app.test'
      });

      expect(html).toBe(
        '<html lang="en"><p>Hello Ana</p><a href="https://app.test">Go</a><em>Notice</em></html>'
      );
    });

    test('renders in the given locale with the localized partials', async () => {
      const html = await engine.render(
        'pages/greeting.html',
        { name: 'Ana', link: 'https://app.test' },
        { locale: 'de-AT' }
      );

      expect(html).toBe(
        '<html lang="de-AT"><p>Hallo Ana</p><a href="https://app.test">Go</a><em>Achtung</em></html>'
      );
    });

    test('escapes the values of a markup template', async () => {
      const html = await engine.render('pages/greeting.html', {
        name: '<script>',
        link: '"x"'
      });

      expect(html).toContain('<p>Hello &lt;script&gt;</p>');
      expect(html).toContain('<a href="&quot;x&quot;">');
    });

    test('writes the values of a text template as they are', async () => {
      const text = await engine.render('pages/greeting.txt', {
        name: '<b>Ana</b>',
        link: 'https://app.test?a=1&b=2'
      });

      expect(text).toBe('Hello <b>Ana</b> Go: https://app.test?a=1&b=2');
    });

    test('renders an XML export', async () => {
      const xml = await engine.render('exports/products.xml', {
        items: [{ id: 1, name: 'Tom & Jerry', description: 'a <b> ]]> c' }]
      });

      expect(xml).toBe(
        '<products><product id="1"><name>Tom &amp; Jerry</name>' +
          '<description><![CDATA[a <b> ]]]]><![CDATA[> c]]></description></product></products>'
      );
    });

    test('renders a CSV export with the locale number format', async () => {
      const items = [{ name: 'Tea "green"', price: 1234.5 }];

      expect(await engine.render('exports/products.csv', { items })).toBe(
        'Tea "green";1,234.50\n'
      );
      expect(
        await engine.render('exports/products.csv', { items }, { locale: 'de' })
      ).toBe('Tea "green";1.234,50\n');
    });

    test('loads the templates with the .handlebars extension', async () => {
      expect(await engine.render('feeds/posts.rss.xml')).toBe(
        '<rss><title>Test App</title></rss>'
      );
    });

    test('prefers the variant of the locale', async () => {
      expect(await engine.render('pages/legal.html')).toBe('Terms');
      expect(
        await engine.render('pages/legal.html', {}, { locale: 'de-CH' })
      ).toBe('Bedingungen');
    });

    test('rejects a template that does not exist', async () => {
      await expect(engine.render('pages/missing.html')).rejects.toMatchObject({
        code: ErrorCode.TemplateNotFound,
        details: { template: 'pages/missing.html', locale: 'en' }
      });
    });

    test('rejects a template only localized to another locale', async () => {
      await expect(
        engine.render('pages/only-german.html')
      ).rejects.toMatchObject({ code: ErrorCode.TemplateNotFound });
      expect(
        await engine.render('pages/only-german.html', {}, { locale: 'de' })
      ).toBe('Nur Deutsch');
    });

    test('wraps a failing render in a template error', async () => {
      writeFile('templates/pages/partial.html.hbs', '{{> partials/missing}}');

      await expect(engine.render('pages/partial.html')).rejects.toMatchObject({
        code: ErrorCode.TemplateRenderFailed,
        details: { template: 'pages/partial.html' }
      });
    });

    test('fails to load a template file with an invalid syntax', async () => {
      writeFile('templates/pages/broken.html.hbs', '{{#if}}');

      await expect(engine.onInit()).rejects.toMatchObject({
        code: ErrorCode.TemplateLoadFailed,
        details: {
          path: path.join(dir, 'templates', 'pages', 'broken.html.hbs')
        }
      });
    });

    test('drops the line break ending a template file', async () => {
      writeFile('templates/partials/name.txt.hbs', '{{name}}\n');
      writeFile('templates/pages/inline.txt.hbs', '[{{> partials/name}}]\n\n');

      expect(await engine.render('pages/inline.txt', { name: 'Ana' })).toBe(
        '[Ana]\n'
      );
    });

    test('caches the partials by the locales having template variants', async () => {
      const data = { name: 'Ana', link: '/' };
      for (const locale of ['fr', 'it', 'es-ES', 'en-GB']) {
        await engine.render('pages/greeting.html', data, { locale });
      }
      await engine.render('pages/greeting.html', data, { locale: 'de-AT' });

      expect((engine as any)._partials.size).toBe(2);
    });

    test('keeps the loaded templates with the cache enabled', async () => {
      expect(await engine.render('pages/legal.html')).toBe('Terms');
      writeFile('templates/pages/legal.html.hbs', 'Changed');

      expect(await engine.render('pages/legal.html')).toBe('Terms');
    });

    test('reloads the changed templates with the cache disabled', async () => {
      configOverrides.TEMPLATE_CACHE = false;

      expect(await engine.render('pages/legal.html')).toBe('Terms');
      writeFile('templates/pages/legal.html.hbs', 'Changed');

      expect(await engine.render('pages/legal.html')).toBe('Changed');
    });

    test('reloads the changed translations with the cache disabled', async () => {
      configOverrides.TEMPLATE_CACHE = false;
      const source = '{{t "greeting" name="Ana"}}';

      expect(await engine.renderString(source)).toBe('Hello Ana');
      writeFile('locales/en.json', JSON.stringify({ greeting: 'Hi {name}' }));

      expect(await engine.renderString(source)).toBe('Hi Ana');
    });
  });

  describe('built-in templates', () => {
    test('renders the framework emails', async () => {
      const data = { link: 'https://app.test/reset?token=1' };

      const html = await engine.render('emails/password-reset.html', data);
      const text = await engine.render('emails/password-reset.txt', data);
      const subject = await engine.render('emails/password-reset.subject');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('href="https://app.test/reset?token&#x3D;1"');
      expect(html).toContain('This email was sent by Test App.');
      expect(text).toContain('https://app.test/reset?token=1');
      expect(subject).toBe('Password reset request');
    });

    test('pluralizes the expiry of the 2FA code', async () => {
      const text = await engine.render('emails/two-factor-code.txt', {
        code: '123456',
        expiresInMinutes: 1
      });

      expect(text).toContain('123456');
      expect(text).toContain('The code expires in 1 minute.');
    });

    test('lets a template file override the email layout', async () => {
      writeFile(
        'templates/layouts/email.html.hbs',
        '<main>{{title}}|{{> @partial-block}}</main>'
      );

      const html = await engine.render('emails/verify-email.html', {
        link: 'https://app.test'
      });

      expect(html).toMatch(/^<main>Verify your email address\|/);
    });

    test('translates the framework emails with the translation files', async () => {
      writeFile(
        'locales/de.json',
        JSON.stringify({ 'emails.verifyEmail.subject': 'E-Mail bestätigen' })
      );
      define(LocaleService, undefined, 'override');
      engine = new HandlebarsTemplateEngine();

      expect(
        await engine.render('emails/verify-email.subject', {}, { locale: 'de' })
      ).toBe('E-Mail bestätigen');
    });
  });

  describe('renderString', () => {
    test('translates a plural message with the arguments of the helper', async () => {
      writeFile(
        'locales/de.json',
        JSON.stringify({
          unread:
            '{name}, Sie haben {msg_cnt, plural, one {# ungelesene Nachricht} other {# ungelesene Nachrichten}}'
        })
      );
      define(LocaleService, undefined, 'override');
      engine = new HandlebarsTemplateEngine();

      const source = '{{t "unread" name=name msg_cnt=count}}';
      expect(
        await engine.renderString(
          source,
          { name: 'Ana', count: 1 },
          { locale: 'de' }
        )
      ).toBe('Ana, Sie haben 1 ungelesene Nachricht');
      expect(
        await engine.renderString(
          source,
          { name: 'Ana', count: 1200 },
          { locale: 'de' }
        )
      ).toBe('Ana, Sie haben 1.200 ungelesene Nachrichten');
    });

    test('escapes the values as HTML by default', async () => {
      expect(
        await engine.renderString('<b>{{value}}</b>', { value: '<i>' })
      ).toBe('<b>&lt;i&gt;</b>');
    });

    test('renders a text source as it is, with the partials and locale', async () => {
      expect(
        await engine.renderString(
          '{{value}} {{t "greeting" name="Ana"}} {{> partials/button label="Go" href="/"}}',
          { value: '<i>' },
          { format: 'txt', locale: 'de' }
        )
      ).toBe('<i> Hallo Ana Go: /');
    });
  });

  describe('hasTemplate', () => {
    test('tells whether a template exists for the locale', async () => {
      expect(await engine.hasTemplate('pages/legal.html')).toBe(true);
      expect(await engine.hasTemplate('emails/verify-email.html')).toBe(true);
      expect(await engine.hasTemplate('pages/missing.html')).toBe(false);
      expect(await engine.hasTemplate('pages/only-german.html')).toBe(false);
      expect(await engine.hasTemplate('pages/only-german.html', 'de')).toBe(
        true
      );
    });
  });

  describe('registerTemplate', () => {
    test('rejects a template with an invalid syntax', () => {
      expect(() =>
        engine.registerTemplate('pages/broken.html', '{{/if}}')
      ).toThrow(
        expect.objectContaining({ code: ErrorCode.TemplateLoadFailed })
      );
    });

    test('registers a template over the template file', async () => {
      engine.registerTemplate('pages/legal.html', 'Registered');
      engine.registerTemplate('pages/legal.html', 'Registriert', 'de');

      expect(await engine.render('pages/legal.html')).toBe('Registered');
      expect(
        await engine.render('pages/legal.html', {}, { locale: 'de' })
      ).toBe('Registriert');
    });

    test('registers a template usable as a partial', async () => {
      engine.registerTemplate('partials/signature.txt', '-- {{@app.name}}');

      expect(
        await engine.renderString(
          'Bye {{> partials/signature}}',
          {},
          {
            format: 'txt'
          }
        )
      ).toBe('Bye -- Test App');
    });
  });

  describe('registerHelper', () => {
    test('registers a helper the templates call', async () => {
      engine.registerHelper('shout', (value: string) => `${value}!`);

      expect(await engine.renderString('{{shout "hi"}}')).toBe('hi!');
    });
  });

  describe('onInit', () => {
    test('fails on a template file that cannot be read, and retries', async () => {
      fs.mkdirSync(path.join(dir, 'templates', 'broken.html.hbs'));

      await expect(engine.onInit()).rejects.toMatchObject({
        code: ErrorCode.TemplateLoadFailed
      });

      fs.rmdirSync(path.join(dir, 'templates', 'broken.html.hbs'));
      expect(await engine.render('pages/legal.html')).toBe('Terms');
    });

    test('loads without the templates directory', async () => {
      configOverrides.TEMPLATE_PATH = path.join(dir, 'missing');

      await expect(engine.onInit()).resolves.toBeUndefined();
      expect(await engine.hasTemplate('emails/password-reset.html')).toBe(true);
    });
  });
});
