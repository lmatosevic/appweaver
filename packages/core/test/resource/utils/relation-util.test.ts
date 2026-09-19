import { createModel } from '../../../factory/create-model';
import { mapRelationInclusions } from '../../../resource/utils/relation-util';
import { resetContext } from '../../fixtures/context-fixture';
import { linkModels } from '../../fixtures/model-fixture';

describe('relation-util', () => {
  beforeEach(() => {
    resetContext();
  });

  describe('mapRelationInclusions', () => {
    /** Defines the Category tree, with the given output config on `parent`. */
    const categoryTree = (output: any): void => {
      createModel({
        name: 'Category',
        scalars: { name: { type: 'string' } },
        relations: {
          parent: {
            model: 'Category',
            type: 'oneToMany',
            mappedBy: 'children',
            owner: true,
            required: false,
            output
          },
          children: {
            model: 'Category',
            type: 'oneToMany',
            mappedBy: 'parent',
            output: { type: 'none' }
          }
        }
      });
      linkModels();
    };

    test('includes a relation of another model one level deep', () => {
      createModel({ name: 'User', scalars: { email: { type: 'string' } } });
      createModel({
        name: 'Post',
        relations: {
          author: { model: 'User', type: 'oneToMany', owner: true }
        }
      });
      linkModels();

      expect(mapRelationInclusions('Post', 'find')).toEqual({ author: true });
    });

    test('repeats a self referencing relation up to its max depth', () => {
      categoryTree({ type: 'always', maxDepth: 3 });

      expect(mapRelationInclusions('Category', 'find')).toEqual({
        parent: { include: { parent: { include: { parent: true } } } }
      });
    });

    test('reads no further than the relation itself at a max depth of one', () => {
      categoryTree({ type: 'always', maxDepth: 1 });

      expect(mapRelationInclusions('Category', 'find')).toEqual({
        parent: true
      });
    });

    test('reads no further than the relation itself by default', () => {
      categoryTree({ type: 'always' });

      expect(mapRelationInclusions('Category', 'find')).toEqual({
        parent: true
      });
    });

    test('leaves a relation between two models unrepeated', () => {
      createModel({ name: 'User', scalars: { email: { type: 'string' } } });
      createModel({
        name: 'Post',
        relations: {
          author: {
            model: 'User',
            type: 'oneToMany',
            owner: true,
            output: { type: 'always', maxDepth: 5 }
          }
        }
      });
      linkModels();

      expect(mapRelationInclusions('Post', 'find')).toEqual({ author: true });
    });

    test('replaces the repetition with an include naming the same relation', () => {
      categoryTree({
        type: 'always',
        maxDepth: 5,
        include: { parent: { type: 'always', maxDepth: 2 } }
      });

      expect(mapRelationInclusions('Category', 'find')).toEqual({
        parent: { include: { parent: { include: { parent: true } } } }
      });
    });

    test('applies the max depth of a nested include to its own model', () => {
      categoryTree({ type: 'always', maxDepth: 1 });
      createModel({
        name: 'Post',
        relations: {
          category: {
            model: 'Category',
            type: 'oneToMany',
            owner: true,
            output: {
              type: 'always',
              include: { parent: { type: 'always', maxDepth: 3 } }
            }
          }
        }
      });
      linkModels();

      expect(mapRelationInclusions('Post', 'find')).toEqual({
        category: {
          include: {
            parent: { include: { parent: { include: { parent: true } } } }
          }
        }
      });
    });

    test('keeps a relation excluded from the output out of the inclusions', () => {
      categoryTree({ type: 'always', maxDepth: 1 });

      expect(mapRelationInclusions('Category', 'find')).not.toHaveProperty(
        'children'
      );
    });

    test('counts a relation configured with an output count', () => {
      createModel({
        name: 'Category',
        scalars: { name: { type: 'string' } },
        relations: {
          children: {
            model: 'Category',
            type: 'oneToMany',
            mappedBy: 'parent',
            output: { type: 'none', count: true }
          },
          parent: {
            model: 'Category',
            type: 'oneToMany',
            mappedBy: 'children',
            owner: true,
            required: false,
            output: { type: 'none' }
          }
        }
      });
      linkModels();

      expect(mapRelationInclusions('Category', 'find')).toEqual({
        _count: { select: { children: true } }
      });
    });

    test('includes a file field without reading further into it', () => {
      createModel({ name: 'Post', files: { coverImage: {} } });
      linkModels();

      expect(mapRelationInclusions('Post', 'find')).toEqual({
        coverImage: true
      });
    });

    describe('soft deleted relations', () => {
      beforeEach(() => {
        createModel({ name: 'User', softDelete: true });
        createModel({ name: 'Tag', softDelete: true });
        createModel({
          name: 'Comment',
          softDelete: true,
          relations: {
            post: {
              model: 'Post',
              type: 'oneToMany',
              owner: true,
              mappedBy: 'comments'
            },
            tags: { model: 'Tag', type: 'manyToMany' }
          }
        });
        createModel({
          name: 'Post',
          relations: {
            author: { model: 'User', type: 'oneToMany', owner: true },
            comments: {
              model: 'Comment',
              type: 'oneToMany',
              mappedBy: 'post',
              output: {
                type: 'always',
                count: true,
                include: { tags: { type: 'always' } }
              }
            }
          }
        });
        linkModels();
      });

      test('reads only the live records of a list relation', () => {
        expect(mapRelationInclusions('Post', 'find')).toMatchObject({
          comments: {
            where: { deletedAt: null },
            include: { tags: { where: { deletedAt: null } } }
          }
        });
      });

      test('counts only the live related records', () => {
        expect(mapRelationInclusions('Post', 'find')._count).toEqual({
          select: { comments: { where: { deletedAt: null } } }
        });
      });

      test('includes a single relation unfiltered', () => {
        expect(mapRelationInclusions('Post', 'find').author).toBe(true);
      });
    });
  });
});
