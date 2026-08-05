import { TObject } from '@sinclair/typebox';
import {
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_TYPE
} from '@appweaver/common';
import { context } from '../../context';
import { createModel } from '../../factory/create-model';
import { resetContext } from '../fixtures/context-fixture';

const properties = (schema: TObject) =>
  schema.properties as Record<string, any>;
const keys = (schema: TObject) => Object.keys(properties(schema));

describe('create-model', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('createModel', () => {
    test('returns a resource model registered in the context', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } }
      });

      expect(model.name).toBe('Post');
      expect(model[RESOURCE_TYPE]).toBe(RESOURCE_MODEL_TYPE);
      expect(model[RESOURCE_NAME]).toBe('Post');
      expect(context.resource.models.get('Post')).toBe(model);
    });

    test('capitalizes the configured model name', () => {
      expect(createModel({ name: 'post' }).name).toBe('Post');
    });

    test('tags every generated schema with the resource name', () => {
      const model = createModel({ name: 'Post' });

      expect((model.readModel as any)[RESOURCE_NAME]).toBe('Post');
      expect((model.readOneModel as any)[RESOURCE_NAME]).toBe('Post');
      expect((model.createOneModel as any)[RESOURCE_NAME]).toBe('Post');
    });

    test('keeps the first model when the same name is registered twice', () => {
      const first = createModel({ name: 'Post' });
      createModel({ name: 'Post' });

      expect(context.resource.models.get('Post')).toBe(first);
    });

    test('replaces the model when the override flag is set', () => {
      createModel({ name: 'Post' });
      const second = createModel({ name: 'Post' }, true);

      expect(context.resource.models.get('Post')).toBe(second);
    });
  });

  describe('id field', () => {
    test('adds an integer id by default', () => {
      const model = createModel({ name: 'Post' });

      expect(properties(model.readModel).id.type).toBe('integer');
    });

    test('supports a string id', () => {
      const model = createModel({ name: 'Post', id: { type: 'string' } });

      expect(properties(model.readModel).id.type).toBe('string');
    });

    test('keeps the id out of the create and update models', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } }
      });

      expect(keys(model.createOneModel)).not.toContain('id');
      expect(keys(model.updateOneModel)).not.toContain('id');
    });
  });

  describe('scalar fields', () => {
    test('maps the scalar types to schema types', () => {
      const model = createModel({
        name: 'Post',
        scalars: {
          title: { type: 'string' },
          views: { type: 'int' },
          rating: { type: 'float' },
          enabled: { type: 'boolean' },
          publishedAt: { type: 'dateTime' },
          metadata: { type: 'json' }
        }
      });

      const props = properties(model.readModel);
      expect(props.title.type).toBe('string');
      expect(props.views.type).toBe('integer');
      expect(props.rating.type).toBe('number');
      expect(props.enabled.type).toBe('boolean');
      expect(props.publishedAt.format).toBe('date-time');
      expect(props.metadata).toBeDefined();
    });

    test('applies the string constraints', () => {
      const model = createModel({
        name: 'Post',
        scalars: {
          title: {
            type: 'string',
            minLength: 3,
            maxLength: 100,
            pattern: '^[a-z]+$',
            example: 'title'
          }
        }
      });

      const title = properties(model.readModel).title;
      expect(title.minLength).toBe(3);
      expect(title.maxLength).toBe(100);
      expect(title.pattern).toBe('^[a-z]+$');
      expect(title.example).toBe('title');
    });

    test('applies the numeric constraints', () => {
      const model = createModel({
        name: 'Post',
        scalars: { views: { type: 'int', minimum: 0, maximum: 100 } }
      });

      const views = properties(model.readModel).views;
      expect(views.minimum).toBe(0);
      expect(views.maximum).toBe(100);
    });

    test('builds an enum schema from the configured values', () => {
      const model = createModel({
        name: 'Post',
        scalars: { status: { type: 'enum', values: ['draft', 'published'] } }
      });

      expect(properties(model.readModel).status.enum).toEqual([
        'draft',
        'published'
      ]);
    });

    test('wraps array scalars in an array schema', () => {
      const model = createModel({
        name: 'Post',
        scalars: { tags: { type: 'string', array: true } }
      });

      const tags = properties(model.readModel).tags;
      expect(tags.type).toBe('array');
      expect(tags.items.type).toBe('string');
    });

    test('makes optional scalars nullable', () => {
      const model = createModel({
        name: 'Post',
        scalars: {
          title: { type: 'string' },
          subtitle: { type: 'string', required: false }
        }
      });

      expect(properties(model.readModel).subtitle.nullable).toBe(true);
      expect(model.readModel.required).toContain('title');
      expect(model.readModel.required).not.toContain('subtitle');
    });

    test('makes scalars with a default optional in the create model', () => {
      const model = createModel({
        name: 'Post',
        scalars: {
          title: { type: 'string' },
          status: { type: 'string', default: 'draft' }
        }
      });

      expect(model.createOneModel.required).toEqual(['title']);
    });

    test('makes every scalar optional in the update model', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' }, views: { type: 'int' } }
      });

      expect(model.updateOneModel.required ?? []).toEqual([]);
    });

    test('removes hidden scalars from the input and output models', () => {
      const model = createModel({
        name: 'User',
        scalars: {
          email: { type: 'string' },
          passwordHash: { type: 'string', hidden: true }
        }
      });

      expect(keys(model.readModel)).toContain('passwordHash');
      expect(keys(model.readOneModel)).not.toContain('passwordHash');
      expect(keys(model.readManyModel)).not.toContain('passwordHash');
      expect(keys(model.createOneModel)).not.toContain('passwordHash');
      expect(keys(model.updateOneModel)).not.toContain('passwordHash');
    });
  });

  describe('audit fields', () => {
    test('adds the audit fields by default', () => {
      const model = createModel({ name: 'Post' });

      expect(keys(model.readModel)).toEqual(
        expect.arrayContaining(['updatedAt', 'createdAt', 'createdById'])
      );
    });

    test('omits the disabled audit fields', () => {
      const model = createModel({
        name: 'Post',
        audit: { createdById: false, updatedAt: false }
      });

      const readKeys = keys(model.readModel);
      expect(readKeys).toContain('createdAt');
      expect(readKeys).not.toContain('createdById');
      expect(readKeys).not.toContain('updatedAt');
    });

    test('keeps the audit fields out of the input models', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } }
      });

      expect(keys(model.createOneModel)).not.toContain('createdAt');
      expect(keys(model.updateOneModel)).not.toContain('createdAt');
    });
  });

  describe('operation restrictions', () => {
    test('picks only the configured read fields', () => {
      const model = createModel({
        name: 'Post',
        scalars: {
          title: { type: 'string' },
          content: { type: 'string' },
          secret: { type: 'string' }
        },
        read: { pick: ['title'] }
      });

      expect(keys(model.readOneModel)).toEqual(['title']);
    });

    test('omits the configured read fields', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' }, secret: { type: 'string' } },
        read: { omit: ['secret'] }
      });

      const readKeys = keys(model.readOneModel);
      expect(readKeys).toContain('title');
      expect(readKeys).not.toContain('secret');
    });

    test('omits the configured create fields', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' }, slug: { type: 'string' } },
        create: { omit: ['slug'] }
      });

      expect(keys(model.createOneModel)).toEqual(['title']);
    });

    test('picks only the configured update fields', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' }, slug: { type: 'string' } },
        update: { pick: ['title'] }
      });

      expect(keys(model.updateOneModel)).toEqual(['title']);
    });
  });

  describe('virtual fields', () => {
    test('adds virtual fields to the read and input models', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } },
        virtual: { excerpt: { type: 'string' } }
      });

      expect(keys(model.readModel)).toContain('excerpt');
      expect(keys(model.virtualModel)).toEqual(['excerpt']);
      expect(keys(model.createOneModel)).toContain('excerpt');
    });

    test('excludes virtual fields marked as output only', () => {
      const model = createModel({
        name: 'Post',
        virtual: { excerpt: { type: 'string', input: { type: 'none' } } }
      });

      expect(keys(model.createOneModel)).not.toContain('excerpt');
      expect(keys(model.updateOneModel)).not.toContain('excerpt');
      expect(keys(model.readOneModel)).toContain('excerpt');
    });

    test('limits a virtual field to the create input', () => {
      const model = createModel({
        name: 'Post',
        virtual: { password: { type: 'string', input: { type: 'create' } } }
      });

      expect(keys(model.createOneModel)).toContain('password');
      expect(keys(model.updateOneModel)).not.toContain('password');
    });

    test('limits a virtual field to a single resource output', () => {
      const model = createModel({
        name: 'Post',
        virtual: { details: { type: 'string', output: { type: 'single' } } }
      });

      expect(keys(model.readOneModel)).toContain('details');
      expect(keys(model.readManyModel)).not.toContain('details');
    });

    test('excludes virtual fields hidden from every output', () => {
      const model = createModel({
        name: 'Post',
        virtual: { internal: { type: 'string', output: { type: 'none' } } }
      });

      expect(keys(model.readOneModel)).not.toContain('internal');
      expect(keys(model.readManyModel)).not.toContain('internal');
    });
  });

  describe('relations', () => {
    test('references the related model in the read model', () => {
      const model = createModel({
        name: 'Post',
        relations: { author: { model: 'User', type: 'oneToMany', owner: true } }
      });

      expect(properties(model.readModel).author.$ref).toBe('UserSingle');
      expect(properties(model.relationsModel).author.$ref).toBe('UserSingle');
    });

    test('builds an array reference for a list relation', () => {
      const model = createModel({
        name: 'User',
        relations: { posts: { model: 'Post', type: 'oneToMany' } }
      });

      const posts = properties(model.relationsModel).posts;
      expect(posts.type).toBe('array');
      expect(posts.items.$ref).toBe('PostSingle');
    });

    test('accepts an id or an id object as the relation input', () => {
      const model = createModel({
        name: 'Post',
        relations: { author: { model: 'User', type: 'oneToMany', owner: true } }
      });

      const author = properties(model.createOneModel).author;
      expect(author.anyOf).toHaveLength(2);
      expect(author.anyOf[0].properties.id).toBeDefined();
      expect(author.anyOf[1].type).toBe('integer');
    });

    test('adds the full model input when configured', () => {
      const model = createModel({
        name: 'Post',
        relations: {
          author: {
            model: 'User',
            type: 'oneToMany',
            owner: true,
            input: { type: 'create', fullModel: true }
          }
        }
      });

      const author = properties(model.createOneModel).author;
      expect(author.anyOf).toHaveLength(3);
      expect(author.anyOf[2].$ref).toBe('UserCreate');
    });

    test('excludes a relation from the inputs when configured', () => {
      const model = createModel({
        name: 'Post',
        relations: {
          author: {
            model: 'User',
            type: 'oneToMany',
            owner: true,
            input: { type: 'none' }
          }
        }
      });

      expect(keys(model.createOneModel)).not.toContain('author');
      expect(keys(model.updateOneModel)).not.toContain('author');
    });

    test('excludes a relation from the outputs when configured', () => {
      const model = createModel({
        name: 'Post',
        relations: {
          author: {
            model: 'User',
            type: 'oneToMany',
            owner: true,
            output: { type: 'none' }
          }
        }
      });

      expect(keys(model.readOneModel)).not.toContain('author');
      expect(keys(model.readManyModel)).not.toContain('author');
    });

    test('adds a relation only to the single resource output', () => {
      const model = createModel({
        name: 'Post',
        relations: {
          comments: {
            model: 'Comment',
            type: 'oneToMany',
            output: { type: 'single' }
          }
        }
      });

      expect(keys(model.readOneModel)).toContain('comments');
      expect(keys(model.readManyModel)).not.toContain('comments');
    });

    test('adds a count field for a relation with count output', () => {
      const model = createModel({
        name: 'Post',
        relations: {
          comments: {
            model: 'Comment',
            type: 'oneToMany',
            output: { type: 'single', count: true }
          }
        }
      });

      expect(keys(model.readOneModel)).toContain('commentsCount');
      expect(properties(model.readOneModel).commentsCount.type).toBe('integer');
    });

    test('makes an optional relation nullable in the output', () => {
      const model = createModel({
        name: 'Post',
        relations: {
          author: {
            model: 'User',
            type: 'oneToMany',
            owner: true,
            required: false
          }
        }
      });

      expect(properties(model.readOneModel).author).toHaveProperty('anyOf');
    });

    test('keeps the input models unchanged without relations', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } }
      });

      expect(keys(model.createOneModel)).toEqual(['title']);
    });
  });

  describe('files', () => {
    test('references the file model for a single file field', () => {
      const model = createModel({ name: 'Post', files: { image: {} } });

      expect(properties(model.filesModel).image).toHaveProperty('anyOf');
      expect(keys(model.readOneModel)).toContain('image');
    });

    test('builds an array reference for a file list', () => {
      const model = createModel({
        name: 'Post',
        files: { gallery: { array: true } }
      });

      const gallery = properties(model.filesModel).gallery;
      expect(gallery.type).toBe('array');
      expect(gallery.items.$ref).toBe('FileSingle');
    });

    test('builds binary upload and delete models', () => {
      const model = createModel({
        name: 'Post',
        files: { image: {}, gallery: { array: true } }
      });

      const upload = properties(model.fileUploadModel);
      expect(upload.image.format).toBe('binary');
      expect(upload.gallery.type).toBe('array');
      expect(upload.gallery.items.format).toBe('binary');

      const remove = properties(model.fileDeleteModel);
      expect(remove.image.type).toBe('string');
      expect(remove.gallery.type).toBe('array');
    });

    test('builds empty file models without file fields', () => {
      const model = createModel({ name: 'Post' });

      expect(keys(model.fileUploadModel)).toEqual([]);
      expect(keys(model.fileDeleteModel)).toEqual([]);
    });

    test('keeps files out of the input models', () => {
      const model = createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } },
        files: { image: {} }
      });

      expect(keys(model.createOneModel)).not.toContain('image');
    });
  });

  describe('schema identifiers', () => {
    test('names the generated schemas after the model', () => {
      const model = createModel({ name: 'Post' });

      expect(model.readModel.$id).toBe('Post');
      expect(model.readOneModel.$id).toBe('PostSingle');
      expect(model.readManyModel.$id).toBe('PostMultiple');
      expect(model.virtualModel.$id).toBe('PostVirtual');
      expect(model.relationsModel.$id).toBe('PostRelations');
      expect(model.filesModel.$id).toBe('PostFiles');
      expect(model.fileUploadModel.$id).toBe('PostFileUpload');
      expect(model.fileDeleteModel.$id).toBe('PostFileDelete');
    });

    test('names the input schemas after the model when relations exist', () => {
      const model = createModel({
        name: 'Post',
        relations: { author: { model: 'User', type: 'oneToMany', owner: true } }
      });

      expect(model.createOneModel.$id).toBe('PostCreate');
      expect(model.updateOneModel.$id).toBe('PostUpdate');
    });
  });
});
