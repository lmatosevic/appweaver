import {
  isEscapedTemplateFormat,
  isLocaleTag,
  parseTemplatePath,
  templateContentType,
  templateFormat,
  templateMimeType
} from '../../utils/template-util';

describe('template-util', () => {
  describe('isLocaleTag', () => {
    test.each(['en', 'de', 'es', 'en-US', 'sr-Latn', 'de-AT'])(
      'accepts the locale %s',
      (tag) => {
        expect(isLocaleTag(tag)).toBe(true);
      }
    );

    test.each([
      'html',
      'xml',
      'rss',
      'csv',
      'txt',
      'subject',
      'json',
      'v2',
      ''
    ])('rejects the format %s', (value) => {
      expect(isLocaleTag(value)).toBe(false);
    });
  });

  describe('parseTemplatePath', () => {
    test('parses the name and format of a template', () => {
      expect(parseTemplatePath('emails/password-reset.html')).toEqual({
        name: 'emails/password-reset.html',
        format: 'html'
      });
    });

    test('extracts the locale of a localized variant', () => {
      expect(parseTemplatePath('emails/password-reset.de.html')).toEqual({
        name: 'emails/password-reset.html',
        format: 'html',
        locale: 'de'
      });
      expect(parseTemplatePath('pages/home.en-US.html')).toEqual({
        name: 'pages/home.html',
        format: 'html',
        locale: 'en-US'
      });
    });

    test('keeps a segment that is not a locale in the name', () => {
      expect(parseTemplatePath('feeds/posts.rss.xml')).toEqual({
        name: 'feeds/posts.rss.xml',
        format: 'xml'
      });
    });

    test('unifies the path separators', () => {
      expect(parseTemplatePath('.\\exports\\orders.csv').name).toBe(
        'exports/orders.csv'
      );
    });

    test('parses a template without a format', () => {
      expect(parseTemplatePath('notes/readme')).toEqual({
        name: 'notes/readme',
        format: ''
      });
    });
  });

  describe('templateFormat', () => {
    test('returns the last extension of the name', () => {
      expect(templateFormat('exports/products.XML')).toBe('xml');
      expect(templateFormat('emails/welcome.subject')).toBe('subject');
    });

    test('returns an empty format for a name without an extension', () => {
      expect(templateFormat('v1.0/readme')).toBe('');
    });
  });

  describe('templateMimeType', () => {
    test('returns the MIME type of a template name or format', () => {
      expect(templateMimeType('pages/invoice.html')).toBe('text/html');
      expect(templateMimeType('exports/products.xml')).toBe('application/xml');
      expect(templateMimeType('csv')).toBe('text/csv');
    });

    test('ignores the inherited object properties', () => {
      expect(templateMimeType('report.constructor')).toBe('text/plain');
      expect(templateMimeType('toString')).toBe('text/plain');
    });

    test('falls back to plain text', () => {
      expect(templateMimeType('emails/welcome.subject')).toBe('text/plain');
    });
  });

  describe('templateContentType', () => {
    test('returns the MIME type in the UTF-8 charset', () => {
      expect(templateContentType('pages/invoice.html')).toBe(
        'text/html; charset=utf-8'
      );
    });
  });

  describe('isEscapedTemplateFormat', () => {
    test('escapes the markup formats only', () => {
      expect(isEscapedTemplateFormat('html')).toBe(true);
      expect(isEscapedTemplateFormat('XML')).toBe(true);
      expect(isEscapedTemplateFormat('txt')).toBe(false);
      expect(isEscapedTemplateFormat('csv')).toBe(false);
    });
  });
});
