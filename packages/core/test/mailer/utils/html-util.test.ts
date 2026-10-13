import { htmlToText } from '../../../mailer/utils/html-util';

describe('html-util', () => {
  describe('htmlToText', () => {
    test('converts the blocks into lines', () => {
      expect(
        htmlToText(
          '<html><head><title>T</title><style>p{}</style></head><body>' +
            '<h1>Title</h1><p>First   line<br/>second</p><!-- hidden --><div>Last</div></body></html>'
        )
      ).toBe('Title\n\nFirst line\nsecond\n\nLast');
    });

    test('keeps the address of a link', () => {
      expect(
        htmlToText(
          '<a href="https://app.test/a">Open <b>it</b></a> <a href="https://app.test/b">https://app.test/b</a>'
        )
      ).toBe('Open it (https://app.test/a) https://app.test/b');
    });

    test('lists the items', () => {
      expect(htmlToText('<ul><li>One</li><li>Two</li></ul>')).toBe(
        '- One\n- Two'
      );
    });

    test('decodes the entities', () => {
      expect(
        htmlToText(
          'Tom &amp; Jerry &lt;3 &#x27;a&#39; &quot;b&quot;&nbsp;&copy; &#99999999;'
        )
      ).toBe('Tom & Jerry <3 \'a\' "b" &copy; &#99999999;');
    });
  });
});
