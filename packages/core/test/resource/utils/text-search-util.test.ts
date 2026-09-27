import { bindTextSearch } from '../../../resource/utils/text-search-util';

describe('text-search-util', () => {
  describe('bindTextSearch', () => {
    test('replaces the placeholder with the searched text', () => {
      expect(
        bindTextSearch({ title: { contains: '{input}' } }, 'news')
      ).toEqual({ title: { contains: 'news' } });
    });

    test('replaces the placeholder inside a longer string', () => {
      expect(
        bindTextSearch({ slug: { startsWith: 'post-{input}' } }, 'news')
      ).toEqual({ slug: { startsWith: 'post-news' } });
    });

    test('keeps the values that are not strings', () => {
      expect(
        bindTextSearch(
          { title: { contains: '{input}', mode: 'insensitive' }, views: 3 },
          'news'
        )
      ).toEqual({ title: { contains: 'news', mode: 'insensitive' }, views: 3 });
    });

    test('turns an OR object into one condition per entry', () => {
      expect(
        bindTextSearch(
          {
            OR: {
              title: { contains: '{input}' },
              excerpt: { contains: '{input}' }
            }
          },
          'news'
        )
      ).toEqual({
        OR: [{ title: { contains: 'news' } }, { excerpt: { contains: 'news' } }]
      });
    });

    test('binds the conditions of an OR list', () => {
      expect(
        bindTextSearch(
          {
            OR: [
              { title: { contains: '{input}' } },
              { author: { name: '{input}' } }
            ]
          },
          'ana'
        )
      ).toEqual({
        OR: [{ title: { contains: 'ana' } }, { author: { name: 'ana' } }]
      });
    });

    test('leaves the template untouched', () => {
      const template = { OR: { title: { contains: '{input}' } } };

      bindTextSearch(template, 'news');

      expect(template).toEqual({ OR: { title: { contains: '{input}' } } });
    });
  });
});
