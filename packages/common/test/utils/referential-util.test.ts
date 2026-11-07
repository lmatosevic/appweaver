import {
  emulatedForeignKeys,
  ForeignKey,
  sqlServerForeignKeys
} from '../../utils/referential-util';
import {
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_TYPE
} from '../../constants';
import { ResourceModel, ResourceModelConfig } from '../../types';

function model(
  name: string,
  config: Omit<Partial<ResourceModelConfig>, 'name'> = {},
  auth: boolean = false
): ResourceModel {
  return {
    name,
    config: { name, ...config },
    [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
    [RESOURCE_AUTH]: auth
  } as unknown as ResourceModel;
}

function models(...list: ResourceModel[]): Record<string, ResourceModel> {
  return Object.fromEntries(list.map((m) => [m.name, m]));
}

function find(
  foreignKeys: ForeignKey[],
  modelName: string,
  foreignKey: string
): ForeignKey | undefined {
  return foreignKeys.find(
    (fk) => fk.modelName === modelName && fk.foreignKey === foreignKey
  );
}

describe('referential-util', () => {
  describe('sqlServerForeignKeys', () => {
    test('keeps the action of a relation forming no cycle and no second path', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('Author'),
          model('Post', {
            relations: {
              author: {
                type: 'oneToMany',
                model: 'author',
                owner: true,
                onDelete: 'cascade'
              }
            }
          })
        )
      );

      expect(find(foreignKeys, 'Post', 'authorId')).toEqual({
        modelName: 'Post',
        foreignKey: 'authorId',
        referencedName: 'Author',
        onDelete: 'cascade',
        onUpdate: undefined,
        dbOnDelete: 'cascade',
        dbOnUpdate: 'noAction'
      });
    });

    test('resolves the default action of a required and an optional relation', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('Author'),
          model('Post', {
            relations: {
              author: { type: 'oneToMany', model: 'Author', owner: true },
              editor: {
                type: 'oneToMany',
                model: 'Author',
                owner: true,
                required: false
              }
            }
          })
        )
      );

      expect(find(foreignKeys, 'Post', 'authorId')).toMatchObject({
        onDelete: 'restrict',
        dbOnDelete: 'noAction'
      });
      // The second relation between the same tables is a second path
      expect(find(foreignKeys, 'Post', 'editorId')).toMatchObject({
        onDelete: 'setNull',
        dbOnDelete: 'setNull'
      });
    });

    test('drops the action of the second relation between the same tables', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('Author'),
          model('Post', {
            relations: {
              author: {
                type: 'oneToMany',
                model: 'Author',
                owner: true,
                required: false
              },
              editor: {
                type: 'oneToMany',
                model: 'Author',
                owner: true,
                required: false
              }
            }
          })
        )
      );

      expect(find(foreignKeys, 'Post', 'authorId')?.dbOnDelete).toBe('setNull');
      expect(find(foreignKeys, 'Post', 'editorId')?.dbOnDelete).toBe(
        'noAction'
      );
    });

    test('drops the action closing a cycle', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('A', {
            relations: {
              b: { type: 'oneToOne', model: 'B', owner: true, required: false }
            }
          }),
          model('B', {
            relations: {
              a: { type: 'oneToOne', model: 'A', owner: true, required: false }
            }
          })
        )
      );

      expect(find(foreignKeys, 'A', 'bId')?.dbOnDelete).toBe('setNull');
      expect(find(foreignKeys, 'B', 'aId')?.dbOnDelete).toBe('noAction');
    });

    test('adds the foreign key of a non-owning side declared alone to the referenced model', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('Post', {
            relations: { comments: { type: 'oneToMany', model: 'Comment' } }
          }),
          model('Comment')
        )
      );

      expect(find(foreignKeys, 'Comment', 'postId')).toMatchObject({
        referencedName: 'Post',
        onDelete: 'setNull',
        dbOnDelete: 'setNull'
      });
    });

    test('counts the cascades of the join tables, declared once for both sides', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('Post', {
            relations: {
              tags: { type: 'manyToMany', model: 'Tag', mappedBy: 'posts' },
              mainTag: {
                type: 'oneToMany',
                model: 'Tag',
                owner: true,
                required: false
              }
            }
          }),
          model('Tag', {
            relations: {
              posts: { type: 'manyToMany', model: 'Post', mappedBy: 'tags' }
            }
          })
        )
      );

      // Tag reaching the join table through Post too would be a second path
      expect(find(foreignKeys, 'Post', 'mainTagId')?.dbOnDelete).toBe(
        'noAction'
      );
    });

    test('counts the cascades of the join tables of the file lists', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('File'),
          model('Post', {
            files: { photos: { array: true }, cover: {} }
          })
        )
      );

      expect(find(foreignKeys, 'Post', 'coverId')).toMatchObject({
        referencedName: 'File',
        onDelete: 'setNull',
        dbOnDelete: 'noAction'
      });
      expect(find(foreignKeys, 'Post', 'photosId')).toBeUndefined();
    });

    test('never acts on the audit relations of the auth model', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('User', {}, true),
          model('Post', { softDelete: true }),
          model('Log', { audit: { createdById: false } })
        )
      );

      for (const foreignKey of ['createdById', 'deletedById']) {
        expect(find(foreignKeys, 'Post', foreignKey)).toMatchObject({
          referencedName: 'User',
          onDelete: 'setNull',
          dbOnDelete: 'noAction',
          dbOnUpdate: 'noAction'
        });
      }
      expect(find(foreignKeys, 'Log', 'createdById')).toBeUndefined();
    });

    test('keeps a declared action on update', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('Author'),
          model('Post', {
            relations: {
              author: {
                type: 'oneToMany',
                model: 'Author',
                owner: true,
                onUpdate: 'cascade'
              }
            }
          })
        )
      );

      expect(find(foreignKeys, 'Post', 'authorId')).toMatchObject({
        dbOnDelete: 'noAction',
        dbOnUpdate: 'cascade'
      });
    });

    test('skips the models without a generated schema', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('Author'),
          model('Post', {
            generateSchema: false,
            relations: {
              author: { type: 'oneToMany', model: 'Author', owner: true },
              tags: { type: 'manyToMany', model: 'Author' }
            },
            files: { photos: { array: true } }
          })
        )
      );

      expect(foreignKeys).toEqual([]);
    });
  });

  describe('emulatedForeignKeys', () => {
    test('lists the cascades and set nulls of a model the database leaves out', () => {
      const foreignKeys = sqlServerForeignKeys(
        models(
          model('User', {}, true),
          model('Post', {
            relations: {
              author: {
                type: 'oneToMany',
                model: 'User',
                owner: true,
                onDelete: 'cascade'
              },
              reviewer: {
                type: 'oneToMany',
                model: 'User',
                owner: true,
                onDelete: 'restrict'
              }
            }
          })
        )
      );

      expect(
        emulatedForeignKeys(foreignKeys, 'User').map(
          (fk) => `${fk.modelName}.${fk.foreignKey}`
        )
      ).toEqual(['User.createdById', 'Post.createdById']);
      expect(emulatedForeignKeys(foreignKeys, 'Post')).toEqual([]);
    });
  });
});
