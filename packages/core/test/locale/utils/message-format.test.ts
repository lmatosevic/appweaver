import {
  formatMessage,
  parseMessage
} from '../../../locale/utils/message-format';

describe('message-format', () => {
  describe('formatMessage', () => {
    test('writes the arguments', () => {
      expect(
        formatMessage(
          'You have {msg_cnt} unread messages, { name }.',
          { msg_cnt: 3, name: 'Ana' },
          'en'
        )
      ).toBe('You have 3 unread messages, Ana.');
    });

    test('keeps the arguments without a value', () => {
      expect(
        formatMessage('Hi {name}, {n, plural, one {#} other {#}}', {}, 'en')
      ).toBe('Hi {name}, {n, plural, one {#} other {#}}');
    });

    test('selects the plural form of any argument', () => {
      const message =
        'You have {msg_cnt, plural, =0 {no unread messages} one {# unread message} other {# unread messages}}';

      expect(formatMessage(message, { msg_cnt: 0 }, 'en')).toBe(
        'You have no unread messages'
      );
      expect(formatMessage(message, { msg_cnt: 1 }, 'en')).toBe(
        'You have 1 unread message'
      );
      expect(formatMessage(message, { msg_cnt: 1234 }, 'en')).toBe(
        'You have 1,234 unread messages'
      );
      expect(formatMessage(message, { msg_cnt: '2' }, 'en')).toBe(
        'You have 2 unread messages'
      );
    });

    test('selects the plural categories of the locale', () => {
      const message =
        '{n, plural, one {# poruka} few {# poruke} other {# poruka}}';

      expect(formatMessage(message, { n: 1 }, 'hr')).toBe('1 poruka');
      expect(formatMessage(message, { n: 3 }, 'hr')).toBe('3 poruke');
      expect(formatMessage(message, { n: 5 }, 'hr')).toBe('5 poruka');
      expect(formatMessage(message, { n: 21 }, 'hr')).toBe('21 poruka');
      expect(formatMessage(message, { n: 1500 }, 'hr')).toBe('1.500 poruka');
    });

    test('subtracts the offset from the plural number', () => {
      const message =
        '{guests, plural, offset:1 =0 {Nobody} =1 {{host}} one {{host} and # other} other {{host} and # others}}';

      expect(formatMessage(message, { guests: 0, host: 'Ana' }, 'en')).toBe(
        'Nobody'
      );
      expect(formatMessage(message, { guests: 1, host: 'Ana' }, 'en')).toBe(
        'Ana'
      );
      expect(formatMessage(message, { guests: 2, host: 'Ana' }, 'en')).toBe(
        'Ana and 1 other'
      );
      expect(formatMessage(message, { guests: 5, host: 'Ana' }, 'en')).toBe(
        'Ana and 4 others'
      );
    });

    test('selects the ordinal form', () => {
      const message =
        '{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} place';

      expect(
        [1, 2, 3, 4, 11, 22].map((place) =>
          formatMessage(message, { place }, 'en')
        )
      ).toEqual([
        '1st place',
        '2nd place',
        '3rd place',
        '4th place',
        '11th place',
        '22nd place'
      ]);
    });

    test('selects a branch by the value', () => {
      const message =
        '{gender, select, female {She} male {He} other {They}} replied to {count, plural, one {# comment} other {# comments}}';

      expect(formatMessage(message, { gender: 'female', count: 1 }, 'en')).toBe(
        'She replied to 1 comment'
      );
      expect(formatMessage(message, { gender: 'x', count: 2 }, 'en')).toBe(
        'They replied to 2 comments'
      );
    });

    test('writes the number of the plural in a nested select', () => {
      expect(
        formatMessage(
          '{n, plural, one {{kind, select, file {# file} other {# item}}} other {{kind, select, file {# files} other {# items}}}}',
          { n: 2, kind: 'file' },
          'en'
        )
      ).toBe('2 files');
    });

    test('formats the number arguments in the locale', () => {
      expect(
        formatMessage(
          '{total, number} | {total, number, integer} | {ratio, number, percent}',
          { total: 1234.5, ratio: 0.25 },
          'de'
        )
      ).toBe('1.234,5 | 1.235 | 25\u00a0%');
    });

    test('writes the quoted text as it is', () => {
      expect(
        formatMessage(
          "It''s '{literal}' and '#' {n, plural, other {'#' is #}}, don't",
          { n: 2, literal: 'x' },
          'en'
        )
      ).toBe("It's {literal} and '#' # is 2, don't");
    });
  });

  describe('parseMessage', () => {
    test('parses a message once', () => {
      expect(parseMessage('Hello {name}')).toBe(parseMessage('Hello {name}'));
    });

    test.each([
      ['Hello {name', "expected '}' or ','"],
      ['Hello }', "unexpected '}'"],
      ['{n, plural, one {#}}', "missing the 'other' option"],
      ['{n, date}', "unsupported argument type 'date'"],
      ['{, plural}', 'expected an argument name'],
      ['Hi {{name}}', 'expected an argument name'],
      ['{n, plural, one #}', "expected '{'"]
    ])('rejects the invalid message %s', (message, reason) => {
      expect(() => parseMessage(message)).toThrow(reason);
    });
  });
});
