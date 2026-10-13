import Handlebars from 'handlebars';
import { LocaleService } from '../../locale';
import { createHandlebarsHelpers } from '../../template/handlebars-helpers';

describe('handlebars-helpers', () => {
  let translate: jest.Mock;
  let handlebars: typeof Handlebars;

  const render = (source: string, data: object = {}, locale = 'en') =>
    handlebars.compile(source)(data, { data: { locale } });

  beforeEach(() => {
    translate = jest.fn((key: string, locale: string, params: object) =>
      [key, locale, JSON.stringify(params)].join('|')
    );
    handlebars = Handlebars.create();
    handlebars.registerHelper(
      createHandlebarsHelpers({ translate } as unknown as LocaleService)
    );
  });

  describe('createHandlebarsHelpers', () => {
    test('translates a key into the rendered locale', () => {
      expect(render('{{t "greeting" name=name}}', { name: 'Ana' }, 'de')).toBe(
        'greeting|de|{&quot;name&quot;:&quot;Ana&quot;}'
      );
      expect(translate).toHaveBeenCalledWith('greeting', 'de', { name: 'Ana' });
    });

    test('translates a key into the given locale', () => {
      render('{{t "greeting" "hr"}}', {}, 'de');

      expect(translate).toHaveBeenCalledWith('greeting', 'hr', {});
    });

    test('compares the values', () => {
      expect(render('{{#if (eq a 1)}}yes{{else}}no{{/if}}', { a: 1 })).toBe(
        'yes'
      );
      expect(
        render('{{ne a 1}} {{lt 1 2}} {{lte 2 2}} {{gt 1 2}} {{gte 2 3}}', {
          a: 1
        })
      ).toBe('false true true false false');
      expect(render('{{and true 1 "x"}} {{or false 0 ""}} {{not false}}')).toBe(
        'true false true'
      );
    });

    test('falls back to a default value', () => {
      expect(render('{{default name "Guest"}}', { name: '' })).toBe('Guest');
      expect(render('{{default name "Guest"}}', { name: 'Ana' })).toBe('Ana');
    });

    test('checks the collections', () => {
      expect(
        render('{{includes roles "Admin"}} {{length roles}}', {
          roles: ['Admin', 'User']
        })
      ).toBe('true 2');
      expect(render('{{includes 5 5}} {{length 5}}')).toBe('false 0');
    });

    test('calculates', () => {
      expect(
        render('{{add 1 "2"}} {{subtract 5 2}} {{multiply 2 3}} {{divide 9 3}}')
      ).toBe('3 3 6 3');
    });

    test('transforms the strings', () => {
      expect(
        render(
          '{{uppercase "ab"}} {{lowercase "AB"}} [{{trim " a "}}] {{truncate "abcdef" 3}} {{truncate "abcdef" 3 "..."}} {{truncate "ab" 3}}'
        )
      ).toBe('AB ab [a] abc… abc... ab');
      expect(render('{{concat "a" 1 null "b"}}')).toBe('a1b');
    });

    test('joins an array', () => {
      expect(
        render('{{join tags}}|{{join tags "/"}}', { tags: ['a', 'b'] })
      ).toBe('a, b|a/b');
      expect(render('{{join tag}}', { tag: 'a' })).toBe('a');
    });

    test('serializes a value as JSON', () => {
      expect(
        handlebars.compile('{{json value}}|{{json value 2}}', {
          noEscape: true
        })({ value: { a: 1 } })
      ).toBe('{"a":1}|{\n  "a": 1\n}');
    });

    test('wraps a value in a CDATA section', () => {
      expect(render('{{cdata value}}', { value: 'a]]>b' })).toBe(
        '<![CDATA[a]]]]><![CDATA[>b]]>'
      );
    });

    test('formats a date in the rendered locale', () => {
      const date = new Date(Date.UTC(2026, 0, 31, 12));

      expect(
        render('{{formatDate date "long" timeZone="UTC"}}', { date })
      ).toBe('January 31, 2026');
      expect(
        render('{{formatDate date "long" timeZone="UTC"}}', { date }, 'de')
      ).toBe('31. Januar 2026');
      expect(render('{{formatDate date "iso"}}', { date })).toBe(
        '2026-01-31T12:00:00.000Z'
      );
      expect(
        render('{{formatDate date year="numeric" timeZone="UTC"}}', {
          date: '2026-05-01T00:00:00Z'
        })
      ).toBe('2026');
      expect(render('{{formatDate date}}', { date: 'invalid' })).toBe('');
      expect(render('{{formatDate date}}', {})).toBe('');
    });

    test('formats a number and a currency in the rendered locale', () => {
      expect(render('{{formatNumber 1234.5}}')).toBe('1,234.5');
      expect(render('{{formatNumber 0.25 style="percent"}}')).toBe('25%');
      expect(render('{{formatCurrency 12.5 "EUR"}}', {}, 'de')).toBe(
        '12,50&nbsp;€'.replace('&nbsp;', ' ')
      );
      expect(render('{{formatNumber "n/a"}}')).toBe('n/a');
      expect(render('{{formatNumber value}}', {})).toBe('');
    });
  });
});
