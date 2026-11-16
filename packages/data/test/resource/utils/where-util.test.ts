import { createModel } from '../../../factory/create-model';
import {
  matchesWhere,
  queryFilterWhere
} from '../../../resource/utils/where-util';
import { linkModels, resetContext } from '@appweaver/testing';

const post = {
  id: 1,
  title: 'Hello World',
  views: 10,
  score: 10n,
  published: true,
  authorId: null,
  publishedAt: new Date('2026-01-02T00:00:00.000Z'),
  createdAt: '2026-01-01T00:00:00.000Z',
  tags: ['a'],
  author: { id: 1 }
};

describe('where-util', () => {
  describe('matchesWhere', () => {
    test.each([
      [undefined, true],
      [null, true],
      [{}, true],
      [{ title: undefined }, true],
      [{ id: 1 }, true],
      [{ id: 2 }, false],
      [{ authorId: null }, true],
      [{ published: true, views: 10 }, true],
      [{ score: 10 }, true],
      [{ views: { equals: 10 } }, true],
      [{ views: { not: 10 } }, false],
      [{ views: { not: { gt: 20 } } }, true],
      [{ views: { in: [1, 10] } }, true],
      [{ views: { notIn: [1, 10] } }, false],
      [{ views: { in: 10 } }, undefined],
      [{ views: { notIn: 10 } }, undefined],
      [{ views: { gt: 5, lte: 10 } }, true],
      [{ views: { lt: 10 } }, false],
      [{ views: { gte: 11 } }, false],
      [{ views: { gt: null } }, false],
      [{ authorId: { gt: 1 } }, false],
      [{ views: { gt: {} } }, undefined],
      [{ title: { contains: 'World' } }, true],
      [{ title: { contains: 'world', mode: 'insensitive' } }, true],
      [{ title: { equals: 'hello world', mode: 'insensitive' } }, true],
      [{ title: { startsWith: 'Hello' } }, true],
      [{ title: { endsWith: 'Hello' } }, false],
      [{ authorId: { contains: 'a' } }, false],
      [{ views: { contains: 'a' } }, undefined],
      [{ publishedAt: { gte: new Date('2026-01-01T00:00:00.000Z') } }, true],
      [{ createdAt: { lt: new Date('2026-01-02T00:00:00.000Z') } }, true],
      [{ createdAt: new Date('2026-01-01T00:00:00.000Z') }, true],
      [{ title: { gt: new Date('2026-01-01T00:00:00.000Z') } }, undefined],
      [{ AND: [{ id: 1 }, { views: 10 }] }, true],
      [{ AND: { id: 2 } }, false],
      [{ OR: [{ id: 2 }, { views: 10 }] }, true],
      [{ OR: [{ id: 2 }, { views: 11 }] }, false],
      [{ OR: [{ id: 2 }, { author: { id: 1 } }] }, undefined],
      [{ NOT: { id: 2 } }, true],
      [{ NOT: [{ id: 1 }] }, false],
      [{ NOT: { author: { is: { id: 1 } } } }, undefined],
      [{ author: { is: { id: 1 } } }, undefined],
      [{ tags: { has: 'a' } }, undefined],
      [{ tags: 'a' }, undefined],
      [{ missing: 1 }, undefined],
      [{ id: 2, missing: 1 }, false],
      [{ missing: 1, id: 2 }, undefined]
    ])('matches %j as %s', (where, expected) => {
      expect(matchesWhere(post, where as never)).toBe(expected);
    });
  });

  describe('queryFilterWhere', () => {
    test('maps a query filter of the routes to a where filter', () => {
      resetContext();
      createModel({
        name: 'Post',
        scalars: { title: { type: 'string' }, views: { type: 'int' } }
      });
      linkModels();

      const where = queryFilterWhere(
        { title: 'Hello World', views: { _gte: 10 } },
        'Post'
      );

      expect(matchesWhere(post, where)).toBe(true);
      expect(
        matchesWhere(post, queryFilterWhere({ views: { _lt: 10 } }, 'Post'))
      ).toBe(false);
    });
  });
});
