import { RESOURCE_AUTH } from '@appweaver/common';
import { resetContext } from '@appweaver/testing';
import { createModel } from '../../factory/create-model';
import { mapResultRecords, mapWriteArgs } from '../../utils/write-data-util';

describe('write-data-util', () => {
  // Marks the records it maps with the model they belong to
  const mark = (modelName: string, data: Record<string, any>) => ({
    ...data,
    model: modelName
  });

  beforeEach(() => {
    resetContext();
    const user = createModel({ name: 'User' });
    (user as any)[RESOURCE_AUTH] = true;
    createModel({
      name: 'Post',
      relations: {
        comments: { type: 'oneToMany', model: 'Comment', mappedBy: 'post' }
      },
      files: { cover: {} }
    });
    createModel({
      name: 'Comment',
      relations: { post: { type: 'oneToMany', model: 'Post', owner: true } }
    });
  });

  describe('mapWriteArgs', () => {
    test('maps the data of the writes, a list of records included', () => {
      expect(
        mapWriteArgs('Post', 'create', { data: { title: 'a' } }, mark)
      ).toEqual({ data: { title: 'a', model: 'Post' } });
      expect(
        mapWriteArgs('Post', 'createMany', { data: [{ title: 'a' }] }, mark)
      ).toEqual({ data: [{ title: 'a', model: 'Post' }] });
      expect(
        mapWriteArgs(
          'Post',
          'upsert',
          { where: { id: 1 }, create: { a: 1 }, update: { b: 2 } },
          mark
        )
      ).toEqual({
        where: { id: 1 },
        create: { a: 1, model: 'Post' },
        update: { b: 2, model: 'Post' }
      });
    });

    test('maps the nested writes of the relations with their models', () => {
      const { data } = mapWriteArgs(
        'Post',
        'update',
        {
          data: {
            comments: {
              create: [{ text: 'a' }],
              createMany: { data: [{ text: 'b' }] },
              update: { where: { id: 1 }, data: { text: 'c' } },
              updateMany: [{ where: {}, data: { text: 'd' } }],
              upsert: { where: { id: 2 }, create: { text: 'e' }, update: {} },
              connectOrCreate: { where: { id: 3 }, create: { text: 'f' } },
              connect: { id: 4 }
            },
            cover: { update: { name: 'g' } },
            createdBy: { create: { email: 'h' } }
          }
        },
        mark
      );

      expect(data.model).toBe('Post');
      expect(data.comments.create).toEqual([{ text: 'a', model: 'Comment' }]);
      expect(data.comments.createMany.data[0].model).toBe('Comment');
      expect(data.comments.update.data.model).toBe('Comment');
      expect(data.comments.updateMany[0].data.model).toBe('Comment');
      expect(data.comments.upsert.create.model).toBe('Comment');
      expect(data.comments.upsert.update.model).toBe('Comment');
      expect(data.comments.connectOrCreate.create.model).toBe('Comment');
      expect(data.comments.connect).toEqual({ id: 4 });
      expect(data.cover.update.model).toBe('File');
      expect(data.createdBy.create.model).toBe('User');
    });

    test('passes the other operations and arguments through', () => {
      const args = { where: { id: 1 } };
      expect(mapWriteArgs('Post', 'findMany', args, mark)).toBe(args);
      expect(mapWriteArgs('Post', 'create', undefined, mark)).toBeUndefined();
    });
  });

  describe('mapResultRecords', () => {
    test('maps the records and their included relations', () => {
      expect(
        mapResultRecords(
          'Post',
          [{ id: 1, comments: [{ id: 2, post: null }], cover: { id: 3 } }],
          mark
        )
      ).toEqual([
        {
          id: 1,
          model: 'Post',
          comments: [{ id: 2, post: null, model: 'Comment' }],
          cover: { id: 3, model: 'File' }
        }
      ]);
    });

    test('passes a result that holds no record through', () => {
      expect(mapResultRecords('Post', 3, mark)).toBe(3);
      expect(mapResultRecords('Post', null, mark)).toBeNull();
    });

    test('follows the models loaded since the last call', () => {
      createModel({
        name: 'Tag',
        relations: { post: { type: 'oneToMany', model: 'Post', owner: true } }
      });
      expect(mapResultRecords('Tag', { id: 1, post: { id: 2 } }, mark)).toEqual(
        { id: 1, model: 'Tag', post: { id: 2, model: 'Post' } }
      );
    });
  });
});
