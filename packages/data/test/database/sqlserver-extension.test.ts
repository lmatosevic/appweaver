import { Prisma } from '../../prisma/client/client';
import { RESOURCE_AUTH } from '@appweaver/common';
import { runInTransaction } from '@appweaver/core/internal';
import { resetContext } from '@appweaver/testing';
import { createModel } from '../../factory/create-model';
import { sqlServerExtension } from '../../database/sqlserver-extension';

/** A delegate of every model the referential actions query. */
function delegates() {
  return {
    user: {
      findMany: jest.fn(async () => [{ id: 1 }, { id: 2 }]),
      updateMany: jest.fn(async () => ({ count: 1 }))
    },
    post: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 }))
    },
    comment: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 }))
    }
  };
}

describe('sqlserver-extension', () => {
  let client: ReturnType<typeof delegates>;
  let tx: ReturnType<typeof delegates>;
  let database: { client: jest.Mock; transaction: jest.Mock };

  const run = async (
    model: string,
    operation: string,
    args: any,
    result: any = {}
  ) => {
    const query = jest.fn(async () => result);
    const value = await sqlServerExtension(
      database
    ).query.$allModels.$allOperations({ model, operation, args, query });
    return { value, query };
  };

  const inTransaction = <T>(fn: () => Promise<T>): Promise<T> =>
    runInTransaction(
      { tx: client, commitCallbacks: new Map(), rollbackCallbacks: [] } as any,
      fn
    );

  beforeEach(() => {
    resetContext();
    client = delegates();
    tx = delegates();
    database = {
      client: jest.fn(() => client),
      transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(tx))
    };

    const user = createModel({ name: 'User' });
    (user as any)[RESOURCE_AUTH] = true;
    createModel({
      name: 'Post',
      scalars: {
        title: { type: 'string' },
        meta: { type: 'json', required: false }
      },
      relations: {
        author: {
          type: 'oneToMany',
          model: 'User',
          owner: true,
          required: false
        },
        editor: {
          type: 'oneToMany',
          model: 'User',
          owner: true,
          required: false
        },
        comments: { type: 'oneToMany', model: 'Comment', mappedBy: 'post' }
      }
    });
    createModel({
      name: 'Comment',
      scalars: { data: { type: 'json' } },
      relations: {
        post: {
          type: 'oneToMany',
          model: 'Post',
          owner: true,
          onDelete: 'cascade'
        }
      }
    });
  });

  describe('sqlServerExtension', () => {
    test('serializes the JSON fields of the stored data', async () => {
      const { query } = await run('Post', 'create', {
        data: { title: 'Hello', meta: { tags: ['a'] } }
      });

      expect(query).toHaveBeenCalledWith({
        data: { title: 'Hello', meta: '{"tags":["a"]}' }
      });
    });

    test.each([
      [
        'update',
        { where: { id: 1 }, data: { meta: [1] } },
        { data: { meta: '[1]' } }
      ],
      ['updateMany', { data: { meta: 'text' } }, { data: { meta: '"text"' } }],
      [
        'createMany',
        { data: [{ meta: 1 }, { title: 'x' }] },
        { data: [{ meta: '1' }, { title: 'x' }] }
      ],
      [
        'upsert',
        { where: { id: 1 }, create: { meta: {} }, update: { meta: null } },
        { create: { meta: '{}' }, update: { meta: null } }
      ]
    ])(
      'serializes the JSON fields of %s',
      async (operation, args, expected) => {
        const { query } = await run('Post', operation, args);

        expect(query).toHaveBeenCalledWith(expect.objectContaining(expected));
      }
    );

    test('serializes and parses the GeoJSON of a geo field', async () => {
      createModel({ name: 'Store', geo: { location: { type: 'point' } } });
      const point = { type: 'Point', coordinates: [1, 2] };

      const { query } = await run('Store', 'create', {
        data: { location: point }
      });
      expect(query).toHaveBeenCalledWith({
        data: { location: JSON.stringify(point) }
      });

      const { value } = await run(
        'Store',
        'findFirst',
        {},
        { id: 1, location: JSON.stringify(point) }
      );
      expect(value).toEqual({ id: 1, location: point });
    });

    test('stores the null sentinels of Prisma as null', async () => {
      const { query } = await run('Post', 'update', {
        where: { id: 1 },
        data: { meta: Prisma.DbNull }
      });

      expect(query).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { meta: null }
      });
    });

    test('serializes the JSON fields of the nested relation writes', async () => {
      const { query } = await run('Post', 'update', {
        where: { id: 1 },
        data: {
          comments: {
            create: [{ data: { a: 1 } }],
            createMany: { data: [{ data: 2 }] },
            update: { where: { id: 3 }, data: { data: 3 } },
            updateMany: [{ where: {}, data: { data: 4 } }],
            upsert: {
              where: { id: 5 },
              create: { data: 5 },
              update: { data: 6 }
            },
            connectOrCreate: { where: { id: 7 }, create: { data: 7 } },
            connect: { id: 8 }
          }
        }
      });

      expect(query).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          comments: {
            create: [{ data: '{"a":1}' }],
            createMany: { data: [{ data: '2' }] },
            update: { where: { id: 3 }, data: { data: '3' } },
            updateMany: [{ where: {}, data: { data: '4' } }],
            upsert: {
              where: { id: 5 },
              create: { data: '5' },
              update: { data: '6' }
            },
            connectOrCreate: { where: { id: 7 }, create: { data: '7' } },
            connect: { id: 8 }
          }
        }
      });
    });

    test('passes the arguments of a read through', async () => {
      const args = { where: { title: 'Hello' } };

      const { query } = await run('Post', 'findMany', args, []);

      expect(query).toHaveBeenCalledWith(args);
    });

    test('parses the JSON fields of the records and of their included relations', async () => {
      const { value } = await run('Post', 'findMany', {}, [
        {
          id: 1,
          meta: '{"tags":["a"]}',
          comments: [{ id: 2, data: '[1,2]' }],
          author: null
        }
      ]);

      expect(value).toEqual([
        {
          id: 1,
          meta: { tags: ['a'] },
          comments: [{ id: 2, data: [1, 2] }],
          author: null
        }
      ]);
    });

    test('returns the result of a count operation unchanged', async () => {
      const { value } = await run('Post', 'count', {}, 3);

      expect(value).toBe(3);
    });

    test('sets null the references the database leaves before a delete', async () => {
      const { query } = await inTransaction(() =>
        run('User', 'deleteMany', { where: { id: { in: [1, 2] } } })
      );

      expect(client.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        select: { id: true }
      });
      // Post.author keeps its set null, Post.editor is a second path
      expect(client.post.updateMany).toHaveBeenCalledWith({
        where: { editorId: { in: [1, 2] } },
        data: { editorId: null }
      });
      expect(client.post.updateMany).toHaveBeenCalledWith({
        where: { createdById: { in: [1, 2] } },
        data: { createdById: null }
      });
      expect(client.post.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { authorId: null } })
      );
      expect(query).toHaveBeenCalled();
    });

    test('leaves the deleted records referencing each other out of a set null', async () => {
      await inTransaction(() => run('User', 'delete', { where: { id: 1 } }));

      expect(client.user.updateMany).toHaveBeenCalledWith({
        where: { createdById: { in: [1, 2] }, id: { notIn: [1, 2] } },
        data: { createdById: null }
      });
    });

    test('cascades to the referencing records the database leaves', async () => {
      // A second cascade from Post to Comment, which the database leaves out
      createModel({
        name: 'Reply',
        relations: {
          comment: {
            type: 'oneToMany',
            model: 'Comment',
            owner: true,
            onDelete: 'cascade'
          },
          post: {
            type: 'oneToMany',
            model: 'Post',
            owner: true,
            onDelete: 'cascade'
          }
        }
      });
      const reply = { deleteMany: jest.fn(async () => ({ count: 1 })) };
      (client as any).reply = reply;
      (client as any).post.findMany = jest.fn(async () => [{ id: 7 }]);

      await inTransaction(() => run('Post', 'delete', { where: { id: 7 } }));

      expect(reply.deleteMany).toHaveBeenCalledWith({
        where: { postId: { in: [7] } }
      });
    });

    test('applies the left out actions of the records the database cascade deletes', async () => {
      // Post reaches Flag directly, so Comment reaching it too is left out
      createModel({
        name: 'Flag',
        relations: {
          post: {
            type: 'oneToMany',
            model: 'Post',
            owner: true,
            required: false
          },
          comment: {
            type: 'oneToMany',
            model: 'Comment',
            owner: true,
            required: false
          }
        }
      });
      const flag = { updateMany: jest.fn(async () => ({ count: 1 })) };
      (client as any).flag = flag;
      (client as any).post.findMany = jest.fn(async () => [{ id: 7 }]);
      (client as any).comment.findMany = jest.fn(async () => [{ id: 3 }]);

      await inTransaction(() => run('Post', 'delete', { where: { id: 7 } }));

      expect((client as any).comment.findMany).toHaveBeenCalledWith({
        where: { postId: { in: [7] } },
        select: { id: true }
      });
      expect(flag.updateMany).toHaveBeenCalledWith({
        where: { commentId: { in: [3] } },
        data: { commentId: null }
      });
    });

    test('runs a delete outside a transaction in one', async () => {
      const deleteMany = jest.fn(async () => ({ count: 2 }));
      (tx as any).user.deleteMany = deleteMany;

      const { query } = await run('User', 'deleteMany', { where: {} });

      expect(database.transaction).toHaveBeenCalled();
      expect(deleteMany).toHaveBeenCalledWith({ where: {} });
      expect(query).not.toHaveBeenCalled();
    });

    test('skips the referential actions when nothing is deleted', async () => {
      client.user.findMany.mockResolvedValue([]);

      const { query } = await inTransaction(() =>
        run('User', 'deleteMany', { where: { id: 9 } })
      );

      expect(client.post.updateMany).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalled();
    });

    test('deletes a model without a left out action directly', async () => {
      const { query } = await run('Comment', 'delete', { where: { id: 1 } });

      expect(database.transaction).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });
});
