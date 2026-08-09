import { createModel } from '../../../factory/create-model';
import { mapSortValues } from '../../../resource/utils/sort-util';
import { resetContext } from '../../fixtures/context-fixture';
import { linkModels } from '../../fixtures/model-fixture';

describe('sort-util', () => {
  /** Maps a sort input against the Post model defined below. */
  const map = (sort: any): any => mapSortValues(sort, 'Post');

  beforeEach(() => {
    resetContext();

    createModel({
      name: 'Team',
      scalars: { name: { type: 'string' } }
    });
    createModel({
      name: 'User',
      scalars: { email: { type: 'string' }, age: { type: 'int' } },
      relations: {
        team: { model: 'Team', type: 'oneToMany', owner: true }
      }
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
        keywords: { type: 'string', array: true },
        secret: { type: 'string', hidden: true }
      },
      virtual: {
        excerpt: {
          type: 'string',
          output: { value: (post: any) => `${post.title ?? ''}...` }
        }
      },
      relations: {
        author: {
          model: 'User',
          type: 'oneToMany',
          owner: true,
          output: { type: 'always', include: { team: { type: 'always' } } }
        },
        reviewer: { model: 'User', type: 'oneToMany', owner: true },
        tags: { model: 'Tag', type: 'manyToMany' },
        editor: {
          model: 'User',
          type: 'oneToMany',
          owner: true,
          output: { type: 'none' }
        }
      }
    });

    linkModels();
  });

  afterAll(() => {
    resetContext();
  });

  describe('mapSortValues', () => {
    test('returns an empty list for an empty sort input', () => {
      expect(map('')).toEqual([]);
      expect(map({})).toEqual([]);
    });

    describe('string input', () => {
      test('maps ascending and descending fields in the declared order', () => {
        expect(map('title,-views,id')).toEqual([
          { title: 'asc' },
          { views: 'desc' },
          { id: 'asc' }
        ]);
      });

      test('maps an explicit ascending prefix and trims the field names', () => {
        expect(map(' +title , -views ')).toEqual([
          { title: 'asc' },
          { views: 'desc' }
        ]);
      });

      test('maps the audit fields', () => {
        expect(map('-createdAt,updatedAt,createdById')).toEqual([
          { createdAt: 'desc' },
          { updatedAt: 'asc' },
          { createdById: 'asc' }
        ]);
      });

      test('maps a dot notation relation path', () => {
        expect(map('-author.email')).toEqual([{ author: { email: 'desc' } }]);
      });

      test('maps a deeply nested relation path', () => {
        expect(map('author.team.name')).toEqual([
          { author: { team: { name: 'asc' } } }
        ]);
      });

      // A database order entry accepts a single field path, so the fields of
      // the same relation cannot share one
      test('gives the fields of the same relation an entry each', () => {
        expect(map('author.email,-author.age')).toEqual([
          { author: { email: 'asc' } },
          { author: { age: 'desc' } }
        ]);
      });

      test('keeps the declared order across the fields of a relation', () => {
        expect(map('author.email,id,-author.age')).toEqual([
          { author: { email: 'asc' } },
          { id: 'asc' },
          { author: { age: 'desc' } }
        ]);
      });

      test('drops a field that is listed twice', () => {
        expect(map('title,-title,id')).toEqual([
          { title: 'asc' },
          { id: 'asc' }
        ]);
      });

      test('maps a relation count field', () => {
        expect(map('-tagsCount')).toEqual([{ tags: { _count: 'desc' } }]);
      });

      test('maps a list relation to its record count', () => {
        expect(map('-tags')).toEqual([{ tags: { _count: 'desc' } }]);
      });

      test('skips empty and sign only parts', () => {
        expect(map('title,,-, +,id')).toEqual([
          { title: 'asc' },
          { id: 'asc' }
        ]);
      });
    });

    describe('object input', () => {
      test('maps the fields in the declared order', () => {
        expect(map({ title: 'asc', views: 'desc' })).toEqual([
          { title: 'asc' },
          { views: 'desc' }
        ]);
      });

      test('throws for a sort direction that is not lower case', () => {
        expect(() => map({ title: 'ASC' })).toThrow(
          /Invalid sort direction 'ASC' for the 'title' field/
        );
        expect(() => map({ title: 'Desc' })).toThrow(
          /Invalid sort direction 'Desc' for the 'title' field/
        );
      });

      test('maps a nested relation object', () => {
        expect(map({ author: { createdAt: 'desc' }, id: 'asc' })).toEqual([
          { author: { createdAt: 'desc' } },
          { id: 'asc' }
        ]);
      });

      test('maps a deeply nested relation object', () => {
        expect(map({ author: { team: { name: 'desc' } } })).toEqual([
          { author: { team: { name: 'desc' } } }
        ]);
      });

      test('gives the fields of the same relation an entry each', () => {
        expect(
          map({ author: { createdAt: 'asc', email: 'desc' }, id: 'asc' })
        ).toEqual([
          { author: { createdAt: 'asc' } },
          { author: { email: 'desc' } },
          { id: 'asc' }
        ]);
      });

      test('maps a relation count field', () => {
        expect(map({ tagsCount: 'desc' })).toEqual([
          { tags: { _count: 'desc' } }
        ]);
      });

      test('maps a list relation to its record count', () => {
        expect(map({ tags: 'desc' })).toEqual([{ tags: { _count: 'desc' } }]);
      });

      test('skips the null and undefined values', () => {
        expect(map({ title: null, views: undefined, id: 'asc' })).toEqual([
          { id: 'asc' }
        ]);
      });

      test('throws for an unknown sort direction', () => {
        expect(() => map({ title: 'ascending' })).toThrow(
          /Invalid sort direction 'ascending' for the 'title' field/
        );
      });

      test('throws for a sort input that is neither a string nor an object', () => {
        expect(() => map(['title'])).toThrow(/Invalid sort value/);
      });
    });

    describe('validation', () => {
      test('throws for an unknown field', () => {
        expect(() => map('unknown')).toThrow(
          /'unknown' is not a sortable field of the Post model/
        );
      });

      test('throws for a hidden scalar field', () => {
        expect(() => map('secret')).toThrow(
          /'secret' is not a sortable field of the Post model/
        );
      });

      test('throws for a virtual field', () => {
        expect(() => map('excerpt')).toThrow(
          /'excerpt' is not a sortable field of the Post model/
        );
      });

      test('throws for an array scalar field', () => {
        expect(() => map('keywords')).toThrow(
          /'keywords' is not a sortable field of the Post model/
        );
      });

      test('throws for an unknown field of a relation', () => {
        expect(() => map('author.unknown')).toThrow(
          /'unknown' is not a sortable field of the User model/
        );
      });

      test('throws for a relation without a nested field', () => {
        expect(() => map({ author: 'desc' })).toThrow(
          /the 'author' relation requires a nested field to sort by/
        );
      });

      test('throws for a field of a list relation', () => {
        expect(() => map('tags.name')).toThrow(
          /the 'tags' relation holds a list of records, sort by the 'tagsCount' field instead/
        );
      });

      test('throws for a scalar field followed by another segment', () => {
        expect(() => map('title.length')).toThrow(
          /'title' is not a relation of the Post model/
        );
      });

      test('throws for a relation that is not included in the response', () => {
        expect(() => map('editor.email')).toThrow(
          /the 'editor' relation is not included in the response/
        );
      });

      test('throws for a nested relation that the parent does not include', () => {
        expect(() => map('reviewer.team.name')).toThrow(
          /the 'team' relation is not included in the response/
        );
      });

      test('resolves the relation inclusions per action', () => {
        createModel(
          {
            name: 'Post',
            scalars: { title: { type: 'string' } },
            relations: {
              author: {
                model: 'User',
                type: 'oneToMany',
                owner: true,
                output: { type: 'single' }
              }
            }
          },
          true
        );
        linkModels();

        // A relation with a single output type is included on find, but not on
        // query, so the same path can only be sorted by on the find action
        expect(mapSortValues('author.email', 'Post', 'find')).toEqual([
          { author: { email: 'asc' } }
        ]);
        expect(() => mapSortValues('author.email', 'Post', 'query')).toThrow(
          /the 'author' relation is not included in the response/
        );
      });

      test('throws with a bad request status code', () => {
        expect(() => map('unknown')).toThrow(
          expect.objectContaining({ statusCode: 400 })
        );
      });
    });

    describe('audit configuration', () => {
      beforeEach(() => {
        createModel(
          {
            name: 'Post',
            audit: { createdAt: false },
            scalars: { title: { type: 'string' } }
          },
          true
        );
        linkModels();
      });

      test('drops the default createdAt sort when the field is not audited', () => {
        expect(map('-createdAt,id')).toEqual([{ id: 'asc' }]);
        expect(map({ createdAt: 'desc', id: 'asc' })).toEqual([{ id: 'asc' }]);
      });

      test('throws for a disabled audit field other than createdAt', () => {
        createModel(
          {
            name: 'Post',
            audit: { updatedAt: false },
            scalars: { title: { type: 'string' } }
          },
          true
        );
        linkModels();

        expect(() => map('updatedAt')).toThrow(
          /'updatedAt' is not a sortable field of the Post model/
        );
      });
    });
  });
});
