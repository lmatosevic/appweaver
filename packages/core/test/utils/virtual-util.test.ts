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
