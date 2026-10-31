import { analyze } from '@/modules/inbox/analyze';

describe('analyze', () => {
  describe('analyze', () => {
    test('counts the words, normalizes the text and tags its keywords', () => {
      expect(analyze('URGENT:  the invoice   was paid twice!')).toEqual({
        words: 6,
        checksum: expect.stringMatching(/^[0-9a-f]{16}$/),
        normalized: 'urgent the invoice was paid twice',
        tags: ['invoice', 'urgent']
      });
    });

    test('gives the same checksum to lines differing in case, spacing and punctuation', () => {
      expect(analyze('Hello, World').checksum).toBe(
        analyze('  hello   world!').checksum
      );
      expect(analyze('Hello, World').checksum).not.toBe(
        analyze('Hello there').checksum
      );
    });

    test('keeps the letters of every language', () => {
      expect(analyze('Čestitke, Đurđa!').normalized).toBe('čestitke đurđa');
    });

    test('rejects a line starting with an exclamation mark', () => {
      expect(() => analyze('  ! not this one')).toThrow(
        'A line starting with "!" is rejected'
      );
    });

    test('rejects a line without words', () => {
      expect(() => analyze('?!... ---')).toThrow('The line has no words');
    });
  });
});
