import { contentDisposition } from '../../utils/http-util';

describe('http-util', () => {
  describe('contentDisposition', () => {
    test('quotes an ASCII name as it is', () => {
      expect(contentDisposition('attachment', 'posts-2026.csv')).toBe(
        'attachment; filename="posts-2026.csv"'
      );
    });

    test('adds the UTF-8 name of a name outside ASCII, with an ASCII fallback', () => {
      expect(contentDisposition('inline', 'café.png')).toBe(
        `inline; filename="cafe.png"; filename*=UTF-8''caf%C3%A9.png`
      );
    });

    test('never lets a quote or a backslash end the quoted name', () => {
      expect(contentDisposition('inline', 'a"b\\c.txt')).toBe(
        `inline; filename="a_b_c.txt"; filename*=UTF-8''a%22b%5Cc.txt`
      );
    });

    test('encodes the characters encodeURIComponent leaves in the extended name', () => {
      expect(contentDisposition('inline', "it's (1).txt")).toBe(
        `inline; filename="it's (1).txt"`
      );
      expect(contentDisposition('inline', "é's (1)*.txt")).toBe(
        `inline; filename="e's (1)*.txt"; filename*=UTF-8''%C3%A9%27s%20%281%29%2A.txt`
      );
    });
  });
});
