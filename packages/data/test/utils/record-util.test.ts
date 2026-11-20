import { linkModels, resetContext } from '@appweaver/testing';
import { createModel } from '../../factory/create-model';
import { projectRecord } from '../../utils/record-util';

describe('record-util', () => {
  beforeEach(() => {
    resetContext();
    createModel({
      name: 'User',
      scalars: {
        email: { type: 'string' },
        passwordHash: { type: 'string', hidden: true }
      }
    });
    createModel({
      name: 'Post',
      scalars: { title: { type: 'string' } },
      relations: {
        author: { model: 'User', type: 'one', required: false },
        editors: { model: 'User', type: 'many' }
      },
      virtual: {
        slug: {
          type: 'string',
          output: { value: (p: any) => p.title.toLowerCase() }
        }
      }
    } as never);
    linkModels();
  });

  describe('projectRecord', () => {
    test('projects a record and its relations onto their read schemas', () => {
      expect(
        projectRecord('Post', {
          id: 1,
          title: 'Hello',
          slug: 'hello',
          internal: true,
          author: { id: 2, email: 'a@test.com', passwordHash: 'x' },
          editors: [{ id: 3, email: 'e@test.com', passwordHash: 'y' }]
        })
      ).toEqual({
        id: 1,
        title: 'Hello',
        slug: 'hello',
        author: { id: 2, email: 'a@test.com' },
        editors: [{ id: 3, email: 'e@test.com' }]
      });
    });

    test('leaves out the fields a relation omits', () => {
      resetContext();
      createModel({
        name: 'User',
        scalars: {
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string', required: false }
        }
      });
      createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } },
        relations: {
          author: {
            model: 'User',
            type: 'one',
            required: false,
            output: { type: 'always', omit: ['email', 'phone'] }
          },
          editors: {
            model: 'User',
            type: 'manyToMany',
            output: { type: 'always', omit: ['email'] }
          }
        }
      } as never);
      linkModels();

      expect(
        projectRecord('Post', {
          id: 1,
          title: 'Hello',
          author: { id: 2, name: 'Ana', email: 'a@test.com', phone: '+1' },
          editors: [{ id: 3, name: 'Ed', email: 'e@test.com', phone: '+2' }]
        })
      ).toEqual({
        id: 1,
        title: 'Hello',
        author: { id: 2, name: 'Ana' },
        editors: [{ id: 3, name: 'Ed', phone: '+2' }]
      });
    });

    test('keeps the virtual fields the service set', () => {
      expect(
        projectRecord('Post', { id: 1, title: 'Hello', slug: 'random-42' })
      ).toEqual({ id: 1, title: 'Hello', slug: 'random-42' });
    });

    test('keeps a null relation', () => {
      expect(
        projectRecord('Post', { id: 1, title: 'A', author: null })
      ).toEqual({ id: 1, title: 'A', author: null });
    });

    test('leaves out the record of an unknown model', () => {
      expect(projectRecord('Missing', { id: 1 })).toBeUndefined();
    });
  });
});
