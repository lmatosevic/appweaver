import { createModel } from '../../factory/create-model';
import { mapQueryFilter } from '../../utils/filter-util';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';

describe('filter-util', () => {
  /** Maps a filter against the Post model defined below. */
  const map = (filter: any): any => mapQueryFilter(filter, 'Post');

  beforeEach(() => {
    resetContext();

    createModel({
      name: 'User',
      scalars: { email: { type: 'string' }, age: { type: 'int' } }
    });
    createModel({
      name: 'Tag',
      scalars: { name: { type: 'string' } }
    });
    createModel({
      name: 'Post',
      scalars: {
        title: { type: 'string' },
        views: { type: 'int' },
        publishedAt: { type: 'dateTime' },
        keywords: { type: 'string', array: true }
      },
      relations: {
        author: { model: 'User', type: 'oneToMany', owner: true },
        tags: { model: 'Tag', type: 'manyToMany' }
      }
    });

    linkModels();
  });

  afterAll(() => {
    resetContext();
  });

  describe('mapQueryFilter', () => {
    test('returns an empty clause for an empty filter', () => {
      expect(map({})).toEqual({});
    });

    describe('comparison operators', () => {
      test('maps the equality operators', () => {
        expect(map({ title: { _eq: 'First' } })).toEqual({
          title: { equals: 'First' }
        });
        expect(map({ title: { _ne: 'First' } })).toEqual({
          title: { not: 'First' }
        });
      });

      test('maps the ordering operators', () => {
        expect(map({ views: { _gt: 1, _gte: 2, _lt: 3, _lte: 4 } })).toEqual({
          views: { gt: 1, gte: 2, lt: 3, lte: 4 }
        });
      });

      test('maps the inclusion operators', () => {
        expect(map({ title: { _in: ['a', 'b'] } })).toEqual({
          title: { in: ['a', 'b'] }
        });
        expect(map({ title: { _nin: ['a'] } })).toEqual({
          title: { notIn: ['a'] }
        });
      });

      test('wraps a single inclusion value into a list', () => {
        expect(map({ title: { _in: 'a' } })).toEqual({ title: { in: ['a'] } });
      });

      test('maps the between operator to an inclusive range', () => {
        expect(map({ views: { _between: [10, 100] } })).toEqual({
          views: { gte: 10, lte: 100 }
        });
      });

      test('maps the like operator by the wildcard placement', () => {
        expect(map({ title: { _like: 'Luk%' } })).toEqual({
          title: { startsWith: 'Luk' }
        });
        expect(map({ title: { _like: '%avatar%' } })).toEqual({
          title: { contains: 'avatar' }
        });
        expect(map({ title: { _like: '%png' } })).toEqual({
          title: { endsWith: 'png' }
        });
        expect(map({ title: { _like: 'exact' } })).toEqual({
          title: { equals: 'exact' }
        });
      });

      test('treats a lone wildcard as a prefix match on an empty value', () => {
        expect(map({ title: { _like: '%' } })).toEqual({
          title: { endsWith: '' }
        });
      });

      test('maps the case-insensitive like operator', () => {
        expect(map({ title: { _ilike: '%avatar%' } })).toEqual({
          title: { contains: 'avatar', mode: 'insensitive' }
        });
      });

      test('maps the string matching operators', () => {
        expect(
          map({ title: { _starts: 'a', _ends: 'b', _contains: 'c' } })
        ).toEqual({
          title: { startsWith: 'a', endsWith: 'b', contains: 'c' }
        });
      });

      test('maps the exists operator on a scalar field', () => {
        expect(map({ publishedAt: { _exists: true } })).toEqual({
          publishedAt: { not: null }
        });
        expect(map({ publishedAt: { _exists: false } })).toEqual({
          publishedAt: { equals: null }
        });
      });

      test('reads the exists operator given as a string', () => {
        expect(map({ publishedAt: { _exists: 'false' } })).toEqual({
          publishedAt: { equals: null }
        });
      });

      test('merges several operators into a single condition', () => {
        expect(map({ title: { _eq: 'First', _exists: true } })).toEqual({
          title: { equals: 'First', not: null }
        });
      });
    });

    describe('list operators', () => {
      test('maps the list membership operators', () => {
        expect(
          map({ keywords: { _has: 'a', _hasSome: ['b'], _hasEvery: ['c'] } })
        ).toEqual({
          keywords: { has: 'a', hasSome: ['b'], hasEvery: ['c'] }
        });
      });

      test('maps the isEmpty operator', () => {
        expect(map({ keywords: { _isEmpty: true } })).toEqual({
          keywords: { isEmpty: true }
        });
      });
    });

    describe('logical operators', () => {
      test('maps an and operator given as an object per field', () => {
        expect(
          map({ _and: { title: { _eq: 'First' }, views: { _gt: 10 } } })
        ).toEqual({
          AND: [{ title: { equals: 'First' } }, { views: { gt: 10 } }]
        });
      });

      test('maps an or operator given as a list of filters', () => {
        expect(
          map({ _or: [{ title: { _like: 'Luk%' } }, { views: 5 }] })
        ).toEqual({ OR: [{ title: { startsWith: 'Luk' } }, { views: 5 }] });
      });

      test('maps the not and nor operators to a combined negation', () => {
        expect(map({ _not: { title: 'First' }, _nor: { views: 5 } })).toEqual({
          NOT: [{ title: 'First' }, { views: 5 }]
        });
      });

      test('combines several logical operators at the same level', () => {
        expect(
          map({
            _and: { title: { _eq: 'First' } },
            _or: { title: { _like: 'Luk%' }, views: { _gt: 10 } }
          })
        ).toEqual({
          AND: [{ title: { equals: 'First' } }],
          OR: [{ title: { startsWith: 'Luk' } }, { views: { gt: 10 } }]
        });
      });

      test('maps a field negation holding an operator object', () => {
        expect(map({ title: { _not: { _like: '%draft%' } } })).toEqual({
          title: { not: { contains: 'draft' } }
        });
      });

      test('maps a field negation holding a plain value', () => {
        expect(map({ title: { _not: 'First' } })).toEqual({
          title: { not: 'First' }
        });
      });
    });

    describe('relation operators', () => {
      test('maps the operators of a nested relation filter', () => {
        expect(
          map({
            author: { _or: { email: { _like: '%@mail.com' }, id: { _eq: 1 } } }
          })
        ).toEqual({
          author: {
            OR: [{ email: { endsWith: '@mail.com' } }, { id: { equals: 1 } }]
          }
        });
      });

      test('maps the exists operator on a single relation', () => {
        expect(map({ author: { _exists: true } })).toEqual({
          author: { isNot: null }
        });
        expect(map({ author: { _exists: false } })).toEqual({
          author: { is: null }
        });
      });

      test('maps a single relation exists with conditions to an is filter', () => {
        expect(
          map({ author: { _exists: true, email: { _eq: 'ada@mail.com' } } })
        ).toEqual({ author: { is: { email: { equals: 'ada@mail.com' } } } });
      });

      test('maps the exists operator on a list relation', () => {
        expect(map({ tags: { _exists: true } })).toEqual({
          tags: { some: {} }
        });
        expect(map({ tags: { _exists: false } })).toEqual({
          tags: { none: {} }
        });
      });

      test('maps the list relation quantifiers', () => {
        expect(
          map({
            tags: {
              _some: { name: 'a' },
              _every: { name: 'b' },
              _none: { name: 'c' }
            }
          })
        ).toEqual({
          tags: {
            some: { name: 'a' },
            every: { name: 'b' },
            none: { name: 'c' }
          }
        });
      });
    });

    describe('plain value shorthands', () => {
      test('maps a scalar value directly', () => {
        expect(map({ title: 'First' })).toEqual({ title: 'First' });
      });

      test('maps a list of scalar values to an inclusion filter', () => {
        expect(map({ title: ['a', 'b'] })).toEqual({
          title: { in: ['a', 'b'] }
        });
      });

      test('maps a numeric and a date list to an inclusive range', () => {
        expect(map({ views: [10, 100] })).toEqual({
          views: { gte: 10, lte: 100 }
        });
        expect(
          map({ publishedAt: ['2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'] })
        ).toEqual({
          publishedAt: {
            gte: '2026-01-01T00:00:00Z',
            lte: '2026-02-01T00:00:00Z'
          }
        });
      });

      test('maps an array scalar field to the contains filters', () => {
        expect(map({ keywords: 'news' })).toEqual({
          keywords: { has: 'news' }
        });
        expect(map({ keywords: ['a', 'b'] })).toEqual({
          keywords: { hasSome: ['a', 'b'] }
        });
      });

      test('maps relation values to an id filter', () => {
        expect(map({ author: 5 })).toEqual({ author: { id: 5 } });
        expect(map({ tags: [1, 2] })).toEqual({
          tags: { some: { id: { in: [1, 2] } } }
        });
      });

      test('maps a nested relation filter through the related model', () => {
        expect(map({ author: { age: [18, 30] } })).toEqual({
          author: { age: { gte: 18, lte: 30 } }
        });
      });

      test('maps a list of nested relation filters', () => {
        expect(map({ tags: [{ name: ['news', 'tech'] }] })).toEqual({
          tags: [{ name: { in: ['news', 'tech'] } }]
        });
      });

      test('passes a null value through unchanged', () => {
        expect(map({ author: null, title: null })).toEqual({
          author: null,
          title: null
        });
      });
    });

    describe('unknown values', () => {
      test('maps the operators of a field unknown to the model', () => {
        expect(map({ meta: { size: { _gt: 50 } } })).toEqual({
          meta: { size: { gt: 50 } }
        });
      });

      test('passes native database conditions through unchanged', () => {
        expect(map({ title: { contains: 'news' } })).toEqual({
          title: { contains: 'news' }
        });
      });

      test('returns the filter unchanged for an unknown model', () => {
        expect(mapQueryFilter({ title: { _eq: 'First' } }, 'Missing')).toEqual({
          title: { equals: 'First' }
        });
      });
    });
  });
});
