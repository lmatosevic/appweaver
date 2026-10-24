import {
  flattenTranslations,
  inlineTranslations
} from '../../utils/translation-util';

describe('translation-util', () => {
  describe('flattenTranslations', () => {
    test('flattens the nested translations into dotted keys', () => {
      expect(
        flattenTranslations({
          greeting: 'Hello',
          emails: { reset: { subject: 'Reset' } }
        })
      ).toEqual({ greeting: 'Hello', 'emails.reset.subject': 'Reset' });
    });
  });

  describe('inlineTranslations', () => {
    const translations = {
      greeting: 'Hello,',
      footer: 'This email was sent by {appName}.',
      quoted: "It''s <easy> & quick",
      expires:
        'The code expires in {count, plural, =0 {no time} one {# minute} other {# minutes}}.',
      items: '{count, plural, other {# items}}'
    };

    test('replaces a translation with its text', () => {
      expect(
        inlineTranslations('<p>{{t "greeting"}}</p>', translations, true)
      ).toBe('<p>Hello,</p>');
    });

    test('writes the arguments as expressions or literals', () => {
      expect(
        inlineTranslations(
          '{{t "footer" appName=@app.name}} {{t "footer" appName="Shop"}}',
          translations,
          false
        )
      ).toBe(
        'This email was sent by {{@app.name}}. This email was sent by Shop.'
      );
    });

    test('escapes the text of an HTML template only', () => {
      expect(inlineTranslations('{{t "quoted"}}', translations, true)).toBe(
        'It&#x27;s &lt;easy&gt; &amp; quick'
      );
      expect(inlineTranslations('{{t "quoted"}}', translations, false)).toBe(
        "It's <easy> & quick"
      );
    });

    test('turns a plural into an if chain', () => {
      expect(
        inlineTranslations('{{t "expires" count=minutes}}', translations, false)
      ).toBe(
        'The code expires in {{#if (eq minutes 0)}}no time{{else if (eq minutes 1)}}{{minutes}} minute{{else}}{{minutes}} minutes{{/if}}.'
      );
      expect(
        inlineTranslations('{{t "items" count=n}}', translations, false)
      ).toBe('{{n}} items');
    });

    test('replaces a subexpression with a string literal', () => {
      expect(
        inlineTranslations(
          '{{#> layout title=(t "greeting")}}x{{/layout}}',
          translations,
          true
        )
      ).toBe('{{#> layout title="Hello,"}}x{{/layout}}');
    });

    test('keeps the other expressions', () => {
      const source = '{{#if link}}<a href="{{link}}">{{label}}</a>{{/if}}';
      expect(inlineTranslations(source, translations, true)).toBe(source);
    });

    test('rejects a missing translation or parameter', () => {
      expect(() =>
        inlineTranslations('{{t "missing"}}', translations, false)
      ).toThrow("Translation 'missing' not found");
      expect(() =>
        inlineTranslations('{{t "footer"}}', translations, false)
      ).toThrow("Translation 'footer' has no parameter 'appName'");
    });

    test('rejects a message that cannot be a subexpression', () => {
      expect(() =>
        inlineTranslations('{{> x a=(t "footer")}}', translations, false)
      ).toThrow('cannot be inlined into a subexpression');
    });
  });
});
