import { MODEL } from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { resetContext } from '@appweaver/testing';
import { createModel } from '../../../factory/create-model';
import {
  registerQueryFilterSchemas,
  relationQueryFilterName
} from '../../../resource/schemas/resource-filter-schema';

/** The properties of a registered schema, by its name. */
function registered(name: string): Record<string, unknown> | undefined {
  const entry = context.definitions.find(
    (definition) =>
      definition.name === MODEL &&
      (definition.value as { name: string }).name === name
  );
  return (entry?.value as { schema: { properties: Record<string, unknown> } })
    ?.schema.properties;
}

describe('resource-filter-schema', () => {
  beforeEach(() => {
    resetContext();

    createModel({
      name: 'User',
      scalars: { name: { type: 'string' }, email: { type: 'string' } }
    });
    createModel({
      name: 'Post',
      scalars: { title: { type: 'string' } },
      relations: {
        author: {
          model: 'User',
          type: 'oneToMany',
          owner: true,
          output: { type: 'always', omit: ['email', 'createdById'] }
        },
        editor: { model: 'User', type: 'oneToMany', owner: true }
      }
    });
  });

  afterAll(() => {
    resetContext();
  });

  describe('relationQueryFilterName', () => {
    test('names the filter after the model and the relation', () => {
      expect(relationQueryFilterName('Post', 'author')).toBe(
        'PostAuthorRelationQueryFilter'
      );
    });
  });

  describe('registerQueryFilterSchemas', () => {
    test('registers a filter without the fields a relation omits', () => {
      registerQueryFilterSchemas();

      const relationFilter = registered('PostAuthorRelationQueryFilter');
      expect(relationFilter).toHaveProperty('name');
      expect(relationFilter).not.toHaveProperty('email');
      expect(relationFilter).not.toHaveProperty('createdById');
      expect(registered('UserQueryFilter')).toHaveProperty('email');
    });

    test('points a relation at its own filter only when it omits fields', () => {
      registerQueryFilterSchemas();

      const postFilter = registered('PostQueryFilter') as Record<string, any>;
      const refs = (field: string) =>
        JSON.stringify(postFilter[field]).match(/"\$ref":"(\w+)"/g);
      expect(refs('author')).toContain(
        '"$ref":"PostAuthorRelationQueryFilter"'
      );
      expect(refs('editor')).toContain('"$ref":"UserQueryFilter"');
      expect(registered('PostEditorRelationQueryFilter')).toBeUndefined();
    });
  });
});
