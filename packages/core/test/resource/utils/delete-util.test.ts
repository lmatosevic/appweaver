import { RESOURCE_AUTH } from '@appweaver/common';
import { context } from '../../../context';
import { createModel } from '../../../factory/create-model';
import {
  assertLiveRelationTargets,
  cascadedRecords,
  hideDeletedRelations,
  liveInclusionFilter,
  liveRelationFilter,
  mergeAffectedRecords,
  removeOrphans,
  retainDeletedFiles,
  softDeleteCascade,
  softDeleteData
} from '../../../resource/utils/delete-util';
import { resetContext } from '../../fixtures/context-fixture';
import { linkModels } from '../../fixtures/model-fixture';
import {
  createDatabaseStub,
  DatabaseStub
} from '../../fixtures/database-fixture';

const LIVE = { deletedAt: null };

describe('delete-util', () => {
  let db: DatabaseStub;
  let tx: any;

  beforeEach(() => {
    resetContext();

    createModel({ name: 'Category', softDelete: true });
    createModel({ name: 'Tag', softDelete: true });
    createModel({ name: 'Label' });
    createModel({
      name: 'Post',
      softDelete: true,
      relations: {
        category: {
          model: 'Category',
          type: 'oneToMany',
          owner: true,
          required: false,
          onDelete: 'setNull'
        },
        comments: { model: 'Comment', type: 'oneToMany', mappedBy: 'post' },
        tags: { model: 'Tag', type: 'manyToMany' },
        labels: { model: 'Label', type: 'manyToMany' }
      }
    });
    createModel({
      name: 'Comment',
      softDelete: true,
      relations: {
        post: {
          model: 'Post',
          type: 'oneToMany',
          owner: true,
          mappedBy: 'comments',
          onDelete: 'cascade'
        }
      }
    });
    createModel({
      name: 'Reply',
      softDelete: true,
      relations: {
        comment: {
          model: 'Comment',
          type: 'oneToMany',
          owner: true,
          onDelete: 'cascade'
        }
      }
    });
    createModel({
      name: 'Bookmark',
      relations: {
        post: { model: 'Post', type: 'oneToMany', owner: true, required: false }
      }
    });
    linkModels();

    db = createDatabaseStub([
      'Category',
      'Tag',
      'Label',
      'Post',
      'Comment',
      'Reply',
      'Bookmark',
      'Review',
      'File'
    ]);
    tx = db.database.client();
  });

  afterAll(() => {
    resetContext();
  });

  const defineReview = () => {
    createModel({
      name: 'Review',
      relations: {
        post: { model: 'Post', type: 'oneToMany', owner: true }
      }
    });
    linkModels();
  };

  describe('liveRelationFilter', () => {
    test('leaves the filter of a model without soft delete unchanged', () => {
      const condition = { some: { name: 'x' } };
      expect(liveRelationFilter(condition, 'Label', true)).toBe(condition);
    });

    test('restricts the list quantifiers to the live records', () => {
      expect(
        liveRelationFilter(
          { some: { name: 'a' }, none: { name: 'b' }, every: { name: 'c' } },
          'Tag',
          true
        )
      ).toEqual({
        some: { AND: [{ name: 'a' }, LIVE] },
        none: { AND: [{ name: 'b' }, LIVE] },
        every: { OR: [{ name: 'c' }, { deletedAt: { not: null } }] }
      });
    });

    test('matches a live single related record by its fields', () => {
      expect(liveRelationFilter({ id: 3 }, 'Category', false)).toEqual({
        is: { AND: [{ id: 3 }, LIVE] }
      });
      expect(
        liveRelationFilter({ is: { name: 'News' } }, 'Category', false)
      ).toEqual({ is: { AND: [{ name: 'News' }, LIVE] } });
    });

    test('treats a deleted single related record as missing', () => {
      expect(liveRelationFilter(null, 'Category', false)).toEqual({
        isNot: LIVE
      });
      expect(liveRelationFilter({ is: null }, 'Category', false)).toEqual({
        isNot: LIVE
      });
      expect(liveRelationFilter({ isNot: null }, 'Category', false)).toEqual({
        is: { AND: [{}, LIVE] }
      });
    });
  });

  describe('liveInclusionFilter', () => {
    test('filters the inclusion of a soft deleted model', () => {
      expect(liveInclusionFilter('Tag')).toEqual({ where: LIVE });
    });

    test('returns undefined for a model without soft delete', () => {
      expect(liveInclusionFilter('Label')).toBeUndefined();
      expect(liveInclusionFilter()).toBeUndefined();
    });
  });

  describe('hideDeletedRelations', () => {
    test('replaces a soft deleted single relation with null', () => {
      const post = {
        id: 1,
        category: { id: 2, deletedAt: new Date() },
        tags: [{ id: 3, deletedAt: null }]
      };

      expect(hideDeletedRelations(post, 'Post')).toEqual({
        id: 1,
        category: null,
        tags: [{ id: 3, deletedAt: null }]
      });
    });

    test('walks the nested relations', () => {
      const comment = {
        id: 1,
        post: { id: 2, deletedAt: null, category: { deletedAt: new Date() } }
      };

      expect(hideDeletedRelations(comment, 'Comment')).toEqual({
        id: 1,
        post: { id: 2, deletedAt: null, category: null }
      });
    });

    test('keeps a live single relation', () => {
      const post = { id: 1, category: { id: 2, deletedAt: null } };
      expect(hideDeletedRelations(post, 'Post')).toEqual(post);
    });
  });

  describe('softDeleteData', () => {
    test('marks the deletion time without an auth model', () => {
      const data = softDeleteData();

      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data).not.toHaveProperty('deletedById');
    });

    test('adds the deleting user column with an auth model', () => {
      const user = createModel({ name: 'User' });
      user[RESOURCE_AUTH] = true;
      context.resource.models.set('User', user);

      expect(softDeleteData()).toEqual({
        deletedAt: expect.any(Date),
        deletedById: null
      });
    });
  });

  describe('softDeleteCascade', () => {
    const data = { deletedAt: new Date('2026-01-01T00:00:00Z') };

    beforeEach(() => {
      db.setResult('Comment', 'findMany', ({ where }: any) =>
        where.postId.in.includes(1) ? [{ id: 10 }, { id: 11 }] : []
      );
      db.setResult('Reply', 'findMany', ({ where }: any) =>
        where.commentId.in.includes(10) ? [{ id: 20 }] : []
      );
    });

    test('soft deletes the cascading records level by level', async () => {
      const affected = await softDeleteCascade(tx, 'Post', [1], data);

      expect(affected).toEqual({ Comment: [10, 11], Reply: [20] });

      const updates = db.queries.filter((q) => q.method === 'updateMany');
      expect(updates).toEqual([
        {
          model: 'Comment',
          method: 'updateMany',
          args: { where: { id: { in: [10, 11] } }, data }
        },
        {
          model: 'Reply',
          method: 'updateMany',
          args: { where: { id: { in: [20] } }, data }
        }
      ]);
    });

    test('only reads the records that are not soft deleted yet', async () => {
      await softDeleteCascade(tx, 'Post', [1], data);

      expect(db.queries.find((q) => q.model === 'Comment')?.args.where).toEqual(
        { postId: { in: [1] }, deletedAt: null }
      );
    });

    test('keeps the references of the relations set to null', async () => {
      await softDeleteCascade(tx, 'Post', [1], data);

      expect(db.queries.some((q) => q.model === 'Bookmark')).toBe(false);
    });

    test('aborts when a restricting relation references the record', async () => {
      defineReview();
      db.setResult('Review', 'count', 2);

      await expect(
        softDeleteCascade(tx, 'Post', [1], data)
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    test('continues when no record references it through a restricting relation', async () => {
      defineReview();
      db.setResult('Review', 'count', 0);

      await expect(softDeleteCascade(tx, 'Post', [1], data)).resolves.toEqual({
        Comment: [10, 11],
        Reply: [20]
      });
      expect(db.lastQuery('count').args.where).toEqual({
        postId: { in: [1] }
      });
    });
  });

  describe('cascadedRecords', () => {
    test('collects the records the database cascade removes', async () => {
      defineReview();
      db.setResult('Comment', 'findMany', [{ id: 10 }]);
      db.setResult('Reply', 'findMany', [{ id: 20 }]);

      const affected = await cascadedRecords(tx, 'Post', [1]);

      expect(affected).toEqual({ Comment: [10], Reply: [20] });
      // Soft deleted records are removed by the cascade as well
      expect(db.queries.find((q) => q.model === 'Comment')?.args.where).toEqual(
        { postId: { in: [1] } }
      );
      // The database rejects a delete a restricting relation prevents
      expect(db.queries.some((q) => q.model === 'Review')).toBe(false);
    });

    test('walks a record reached twice only once', async () => {
      db.setResult('Comment', 'findMany', [{ id: 10 }]);
      db.setResult('Reply', 'findMany', [{ id: 20 }]);

      await cascadedRecords(tx, 'Post', [1]);

      expect(
        db.queries.filter((q) => q.model === 'Reply').map((q) => q.args.where)
      ).toEqual([{ commentId: { in: [10] } }]);
    });
  });

  describe('removeOrphans', () => {
    const data = { deletedAt: new Date('2026-01-01T00:00:00Z') };
    const defineOrphanRemoval = () => {
      createModel(
        {
          name: 'Post',
          softDelete: true,
          relations: {
            comments: {
              model: 'Comment',
              type: 'oneToMany',
              mappedBy: 'post',
              orphanRemoval: true
            },
            labels: {
              model: 'Label',
              type: 'manyToMany',
              orphanRemoval: true
            }
          }
        },
        true
      );
      createModel(
        {
          name: 'Label',
          relations: {
            posts: { model: 'Post', type: 'manyToMany', mappedBy: 'labels' }
          }
        },
        true
      );
      linkModels();
    };

    beforeEach(() => {
      defineOrphanRemoval();
    });

    test('soft deletes the orphans of a soft deleted model', async () => {
      db.setResult('Comment', 'findMany', ({ where }: any) =>
        where.OR ? [{ id: 10 }] : []
      );
      db.setResult('Reply', 'findMany', [{ id: 20 }]);
      const actions: any = { comments: { delete: [{ id: 10 }] } };

      const deleted = await removeOrphans(tx, 'Post', actions, data);

      expect(deleted).toEqual({
        soft: { Comment: [10], Reply: [20] },
        hard: {}
      });
      expect(
        db.queries.filter((q) => q.method === 'updateMany').map((q) => q.model)
      ).toEqual(['Reply', 'Comment']);
      // The orphans keep their references like any soft deleted record
      expect(actions).toEqual({ comments: undefined });
      expect(actions).toHaveProperty('comments');
    });

    test('keeps the other actions of a soft deleted orphan relation', async () => {
      db.setResult('Comment', 'findMany', ({ where }: any) =>
        where.OR ? [{ id: 10 }] : []
      );
      db.setResult('Reply', 'findMany', []);
      const actions: any = {
        comments: { delete: [{ id: 10 }], connect: [{ id: 11 }] }
      };

      await removeOrphans(tx, 'Post', actions, data);

      expect(actions).toEqual({ comments: { connect: [{ id: 11 }] } });
    });

    test('leaves the other orphans to the database delete', async () => {
      db.setResult('Label', 'findMany', [{ id: 5 }, { id: 6 }]);
      const actions: any = { labels: { delete: [{ id: 5 }, { id: 6 }] } };

      const deleted = await removeOrphans(tx, 'Post', actions, data);

      expect(deleted).toEqual({ soft: {}, hard: { Label: [5, 6] } });
      expect(actions).toEqual({ labels: { delete: [{ id: 5 }, { id: 6 }] } });
      expect(db.lastQuery('findMany').args).toEqual({
        where: { OR: [{ id: 5 }, { id: 6 }] },
        select: { id: true }
      });
    });

    test('skips the relations without orphans', async () => {
      const actions: any = { labels: { disconnect: [{ id: 5 }] } };

      await expect(removeOrphans(tx, 'Post', actions, data)).resolves.toEqual({
        soft: {},
        hard: {}
      });
      expect(db.queries).toEqual([]);
    });
  });

  describe('retainDeletedFiles', () => {
    const data = { deletedAt: new Date('2026-01-01T00:00:00Z') };

    beforeEach(() => {
      createModel({ name: 'File', softDelete: true });
      createModel(
        {
          name: 'Label',
          files: {
            icon: {},
            source: { onResourceDeleted: 'keep' }
          }
        },
        true
      );
      createModel(
        {
          name: 'Tag',
          softDelete: true,
          files: {
            icon: {},
            source: { onResourceSoftDeleted: 'delete' }
          }
        },
        true
      );
      linkModels();
    });

    test('marks the files the deleted records keep as deleted', async () => {
      await retainDeletedFiles(
        tx,
        { soft: { Tag: [1, 2] }, hard: { Label: [3] } },
        data
      );

      expect(
        db.queries.filter((q) => q.model === 'File').map((q) => q.args)
      ).toEqual([
        {
          where: {
            resourceName: 'Tag',
            resourceId: { in: ['1', '2'] },
            resourceField: { in: ['icon'] },
            deletedAt: null
          },
          data
        },
        {
          where: {
            resourceName: 'Label',
            resourceId: { in: ['3'] },
            resourceField: { in: ['source'] },
            deletedAt: null
          },
          data
        }
      ]);
    });

    test('skips the models that keep no files', async () => {
      await retainDeletedFiles(
        tx,
        { soft: { Comment: [1] }, hard: { Bookmark: [2] } },
        data
      );

      expect(db.queries).toEqual([]);
    });
  });

  describe('mergeAffectedRecords', () => {
    test('merges the ids of every model without duplicates', () => {
      expect(
        mergeAffectedRecords({ Post: [1] }, { Post: [1, 2] }, { Tag: ['a'] })
      ).toEqual({ Post: [1, 2], Tag: ['a'] });
    });
  });

  describe('assertLiveRelationTargets', () => {
    test('rejects a connect to a soft deleted record', async () => {
      db.setResult('Tag', 'count', 1);

      await expect(
        assertLiveRelationTargets(tx, 'Post', {
          tags: { connect: [{ id: 1 }, { id: 2 }] }
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(db.lastQuery('count').args.where).toEqual({
        AND: [{ deletedAt: { not: null } }, { OR: [{ id: 1 }, { id: 2 }] }]
      });
    });

    test('checks the inline updates and connect-or-create matches', async () => {
      db.setResult('Tag', 'count', 0);

      await assertLiveRelationTargets(tx, 'Post', {
        tags: {
          update: [{ where: { id: 3 }, data: {} }],
          connectOrCreate: [{ where: { name: 'news' }, create: {} }]
        }
      });

      expect(db.lastQuery('count').args.where.AND[1]).toEqual({
        OR: [{ id: 3 }, { name: 'news' }]
      });
    });

    test('skips the relations of models without soft delete', async () => {
      await assertLiveRelationTargets(tx, 'Post', {
        labels: { connect: [{ id: 1 }] },
        tags: { disconnect: [{ id: 2 }] }
      });

      expect(db.queries).toEqual([]);
    });
  });
});
