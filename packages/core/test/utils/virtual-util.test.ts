import { createModel } from '../../factory/create-model';
import { projectVirtualFields } from '../../utils/virtual-util';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';

describe('virtual-util', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('projectVirtualFields', () => {
    test('evaluates a virtual field function against the resource', () => {
      createModel({
        name: 'User',
        scalars: {
          firstName: { type: 'string' },
          lastName: { type: 'string' }
        },
        virtual: {
          fullName: {
            type: 'string',
            output: {
              value: (user: any) => `${user.firstName} ${user.lastName}`
            }
          }
        }
      });

      const projected = projectVirtualFields(
        { id: 1, firstName: 'Ada', lastName: 'Lovelace' },
        'User'
      );

      expect(projected).toEqual({
        id: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: 'Ada Lovelace'
      });
    });

    test('assigns a constant output value', () => {
      createModel({
        name: 'Post',
        virtual: { kind: { type: 'string', output: { value: 'article' } } }
      });

      expect(projectVirtualFields({ id: 1 }, 'Post')).toEqual({
        id: 1,
        kind: 'article'
      });
    });

    test('uses the configured default when no output value is given', () => {
      createModel({
        name: 'Post',
        virtual: { score: { type: 'int', default: 5 } }
      });

      expect(projectVirtualFields({ id: 1 }, 'Post')).toEqual({
        id: 1,
        score: 5
      });
    });

    test('falls back to the scalar type default', () => {
      createModel({
        name: 'Post',
        virtual: {
          label: { type: 'string' },
          count: { type: 'int' },
          flag: { type: 'boolean' },
          items: { type: 'string', array: true }
        }
      });

      expect(projectVirtualFields({ id: 1 }, 'Post')).toEqual({
        id: 1,
        label: '',
        count: 0,
        flag: false,
        items: []
      });
    });

    test('skips optional virtual fields without an output value', () => {
      createModel({
        name: 'Post',
        virtual: { note: { type: 'string', required: false } }
      });

      expect(projectVirtualFields({ id: 1 }, 'Post')).toEqual({ id: 1 });
    });

    test('overwrites an existing value with the projected one', () => {
      createModel({
        name: 'Post',
        virtual: { kind: { type: 'string', output: { value: 'article' } } }
      });

      expect(projectVirtualFields({ id: 1, kind: 'stale' }, 'Post')).toEqual({
        id: 1,
        kind: 'article'
      });
    });

    test('does not mutate the original resource', () => {
      createModel({
        name: 'Post',
        virtual: { kind: { type: 'string', output: { value: 'article' } } }
      });

      const resource = { id: 1 };
      const projected = projectVirtualFields(resource, 'Post');

      expect(resource).toEqual({ id: 1 });
      expect(projected).not.toBe(resource);
    });

    test('returns the value unchanged for an unknown model', () => {
      expect(projectVirtualFields({ id: 1 }, 'Missing')).toEqual({ id: 1 });
    });

    test('returns null and undefined unchanged', () => {
      expect(projectVirtualFields(null, 'Post')).toBeNull();
      expect(projectVirtualFields(undefined, 'Post')).toBeUndefined();
    });

    test('projects nested file objects', () => {
      createModel({
        name: 'File',
        scalars: { name: { type: 'string' } },
        virtual: {
          url: {
            type: 'string',
            output: { value: (file: any) => `/files/${file.name}` }
          }
        }
      });
      createModel({ name: 'Post', files: { image: {} } });

      linkModels();

      const projected: any = projectVirtualFields(
        { id: 1, image: { id: 5, name: 'logo.png' } },
        'Post'
      );

      expect(projected.image.url).toBe('/files/logo.png');
    });

    test('projects nested file arrays', () => {
      createModel({
        name: 'File',
        scalars: { name: { type: 'string' } },
        virtual: {
          url: {
            type: 'string',
            output: { value: (file: any) => `/files/${file.name}` }
          }
        }
      });
      createModel({ name: 'Post', files: { images: { array: true } } });

      linkModels();

      const projected: any = projectVirtualFields(
        {
          id: 1,
          images: [
            { id: 5, name: 'a.png' },
            { id: 6, name: 'b.png' }
          ]
        },
        'Post'
      );

      expect(projected.images.map((image: any) => image.url)).toEqual([
        '/files/a.png',
        '/files/b.png'
      ]);
    });

    test('projects a nested single relation object', () => {
      createModel({
        name: 'User',
        scalars: { firstName: { type: 'string' } },
        virtual: {
          label: {
            type: 'string',
            output: { value: (user: any) => `@${user.firstName}` }
          }
        }
      });
      createModel({ name: 'Post', relations: { author: { model: 'User' } } });

      linkModels();

      const projected: any = projectVirtualFields(
        { id: 1, author: { id: 2, firstName: 'Ada' } },
        'Post'
      );

      expect(projected.author.label).toBe('@Ada');
    });

    test('projects a nested relation array', () => {
      createModel({
        name: 'Tag',
        scalars: { name: { type: 'string' } },
        virtual: {
          slug: {
            type: 'string',
            output: { value: (tag: any) => tag.name.toLowerCase() }
          }
        }
      });
      createModel({
        name: 'Post',
        relations: { tags: { model: 'Tag', array: true } }
      });

      linkModels();

      const projected: any = projectVirtualFields(
        {
          id: 1,
          tags: [
            { id: 2, name: 'News' },
            { id: 3, name: 'Tech' }
          ]
        },
        'Post'
      );

      expect(projected.tags.map((tag: any) => tag.slug)).toEqual([
        'news',
        'tech'
      ]);
    });

    test('projects nested relations recursively through their own relations', () => {
      createModel({
        name: 'Team',
        scalars: { name: { type: 'string' } },
        virtual: {
          handle: {
            type: 'string',
            output: { value: (team: any) => `#${team.name}` }
          }
        }
      });
      createModel({
        name: 'User',
        relations: { team: { model: 'Team' } }
      });
      createModel({ name: 'Post', relations: { author: { model: 'User' } } });

      linkModels();

      const projected: any = projectVirtualFields(
        { id: 1, author: { id: 2, team: { id: 3, name: 'Core' } } },
        'Post'
      );

      expect(projected.author.team.handle).toBe('#Core');
    });

    test('leaves an unset single relation as null', () => {
      createModel({ name: 'User', scalars: { email: { type: 'string' } } });
      createModel({
        name: 'Post',
        relations: { author: { model: 'User', required: false } }
      });

      linkModels();

      const projected: any = projectVirtualFields(
        { id: 1, author: null },
        'Post'
      );

      expect(projected.author).toBeNull();
    });

    test('leaves nested objects of unknown relations unchanged', () => {
      createModel({ name: 'Post', scalars: { title: { type: 'string' } } });

      const projected: any = projectVirtualFields(
        { id: 1, metadata: { any: 'value' } },
        'Post'
      );

      expect(projected.metadata).toEqual({ any: 'value' });
    });
  });
});
