import { Value } from '@sinclair/typebox/value';
import { ErrorCode } from '@appweaver/common';
import { linkModels, resetContext } from '@appweaver/testing';
import { context } from '@appweaver/core/internal';
import { createModel } from '../../factory/create-model';

describe('create-model', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('createModel', () => {
    test('leaves the omitted fields out of the output of a relation only', () => {
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
      const post = context.resource.models.get('Post')!;
      const user = context.resource.models.get('User')!;
      const postSchema = post.readOneModel.$defs.PostSingle;

      expect(Object.keys(postSchema.properties.author.properties)).toEqual(
        expect.arrayContaining(['id', 'name'])
      );
      expect(postSchema.properties.author.properties).not.toHaveProperty(
        'email'
      );
      expect(postSchema.properties.author.properties).not.toHaveProperty(
        'phone'
      );
      expect(postSchema.properties.author.nullable).toBe(true);
      expect(
        Object.keys(postSchema.properties.editors.items.properties)
      ).toEqual(expect.arrayContaining(['name', 'phone']));
      expect(
        Object.keys(postSchema.properties.editors.items.properties)
      ).not.toContain('email');
      expect(
        Object.keys(user.readOneModel.$defs.UserSingle.properties)
      ).toEqual(expect.arrayContaining(['email', 'phone']));
      expect(JSON.stringify(postSchema)).not.toMatch(/"target"|"parameters"/);
    });

    test('takes the geo fields as GeoJSON, a point input as a { lat, lng } too', () => {
      const model = createModel({
        name: 'Store',
        geo: {
          location: { type: 'point', description: 'Where it is' },
          area: { type: 'polygon', required: false },
          shape: { type: 'geometry', hidden: true }
        },
        update: { omit: ['shape'] }
      });
      const point = { type: 'Point', coordinates: [15.9, 45.8] };
      const latLng = { lat: 45.8, lng: 15.9 };

      expect(Value.Check(model.readModel.properties.location, point)).toBe(
        true
      );
      expect(Value.Check(model.readModel.properties.location, latLng)).toBe(
        false
      );
      expect(model.readModel.properties.location.description).toBe(
        'Where it is'
      );
      expect(model.readModel.properties.area.nullable).toBe(true);
      expect(model.readModel.properties.shape.hidden).toBe(true);

      expect(Value.Check(model.createModel.properties.location, latLng)).toBe(
        true
      );
      expect(Value.Check(model.createModel.properties.shape, latLng)).toBe(
        true
      );
      expect(model.createModel.required).toEqual(['location', 'shape']);
      expect(Object.keys(model.updateModel.properties)).toEqual([
        'location',
        'area'
      ]);
      expect(
        Value.Check(model.createModel.properties.location, {
          type: 'Point',
          coordinates: [200, 0]
        })
      ).toBe(false);
    });

    test('returns the distance of a visible geo field, read with its field', () => {
      const model = createModel({
        name: 'Store',
        geo: {
          location: { type: 'point' },
          area: { type: 'polygon', required: false },
          secret: { type: 'point', hidden: true },
          hideout: { type: 'geometry', hidden: true, required: false }
        },
        read: { omit: ['area'] }
      });

      const distance = model.readModel.properties.locationDistance;
      expect(Value.Check(distance, 12.5)).toBe(true);
      expect(Value.Check(distance, -1)).toBe(false);
      expect(model.readModel.required).not.toContain('locationDistance');
      expect(Object.keys(model.readModel.properties)).not.toContain(
        'secretDistance'
      );

      // The distance leaves with its field, and a hidden field has no input
      for (const schema of [model.readOneModel, model.readManyModel]) {
        expect(Object.keys(schema.properties)).toEqual(
          expect.arrayContaining(['location', 'locationDistance'])
        );
        expect(Object.keys(schema.properties)).toEqual(
          expect.not.arrayContaining([
            'area',
            'areaDistance',
            'secret',
            'hideout'
          ])
        );
      }
      expect(Object.keys(model.createOneModel.properties)).toEqual([
        'location',
        'area'
      ]);
    });

    test('picks the distance of a picked geo field', () => {
      const model = createModel({
        name: 'Store',
        scalars: { name: { type: 'string' } },
        geo: { location: { type: 'point' }, area: { type: 'polygon' } },
        read: { pick: ['id', 'location'] }
      });
      expect(Object.keys(model.readOneModel.properties)).toEqual([
        'id',
        'location',
        'locationDistance'
      ]);
    });

    test.each([
      [{ location: { type: 'circle' } }, "has the type 'circle'"],
      [{ name: { type: 'point' } }, "'name' is another field"],
      [
        { location: { type: 'point' }, locationGeom: { type: 'point' } },
        "'locationGeom' is another field"
      ],
      [
        { location: { type: 'point' }, locationDistance: { type: 'point' } },
        "'locationDistance' is another field"
      ],
      [{ 'bad-name': { type: 'point' } }, 'must be an identifier']
    ])('rejects the geo fields %j', (geo, message) => {
      expect(() =>
        createModel({
          name: 'Store',
          scalars: { name: { type: 'string' } },
          geo: geo as any
        })
      ).toThrow(
        expect.objectContaining({
          code: ErrorCode.ConfigurationInvalid,
          message: expect.stringContaining(message)
        })
      );
    });

    test('leaves a hidden nullable json scalar out of the inputs and outputs', () => {
      const model = createModel({
        name: 'Post',
        scalars: {
          title: { type: 'string' },
          meta: { type: 'json', required: false, hidden: true }
        }
      });

      for (const schema of [
        model.readOneModel,
        model.readManyModel,
        model.createOneModel,
        model.updateOneModel
      ]) {
        expect(Object.keys(schema.properties)).not.toContain('meta');
      }
    });

    test('builds the series values of a model, each optional and nullable', () => {
      const model = createModel({
        name: 'Sensor',
        series: {
          temperature: { type: 'float', minimum: -50, maximum: 150 },
          errors: { type: 'int' },
          online: { type: 'boolean' }
        }
      });

      expect(Object.keys(model.seriesModel.properties)).toEqual([
        'temperature',
        'errors',
        'online'
      ]);
      // A null is accepted by the `nullable` keyword of the request validation
      expect(model.seriesModel.properties.errors.nullable).toBe(true);
      expect(
        Value.Check(model.seriesModel, { temperature: 20.5, errors: 2 })
      ).toBe(true);
      expect(Value.Check(model.seriesModel, {})).toBe(true);
      expect(Value.Check(model.seriesModel, { temperature: 200 })).toBe(false);
      expect(Value.Check(model.seriesModel, { errors: 1.5 })).toBe(false);
      expect(Value.Check(model.seriesModel, { online: 1 })).toBe(false);
    });

    test('builds no series values without series fields', () => {
      const model = createModel({ name: 'Post' });

      expect(model.seriesModel.properties).toEqual({});
    });

    test.each([
      [{ time: { type: 'float' } }],
      [{ resourceId: { type: 'int' } }],
      [{ 'bad-name': { type: 'int' } }],
      [{ label: { type: 'string' } }]
    ])('rejects the series fields %j', (series) => {
      expect(() =>
        createModel({ name: 'Sensor', series: series as any })
      ).toThrow(
        expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
      );
    });

    test.each([
      [{ retention: 'yearly' }],
      [{ chunkInterval: '1.5s' }],
      [{ compressAfter: '0d' }],
      [{ ingest: 'batch' }]
    ])('rejects the series options %j', (seriesOptions) => {
      expect(() =>
        createModel({
          name: 'Sensor',
          series: { errors: { type: 'int' } },
          seriesOptions: seriesOptions as any
        })
      ).toThrow(
        expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
      );
    });

    test.each([
      [{ maxCount: -1 }],
      [{ maxCount: 1.5 }],
      [{ maxAge: 'a week' }]
    ])('rejects the file versions %j', (versions) => {
      expect(() =>
        createModel({
          name: 'Document',
          files: { content: { versions: versions as any } }
        })
      ).toThrow(
        expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
      );
    });

    test('builds the version delete input of the fields keeping versions', () => {
      const model = createModel({
        name: 'Document',
        files: {
          content: { versions: { maxCount: 0, maxAge: '30d' } },
          preview: { versions: false }
        }
      });

      expect(model.fileVersionDeleteModel.$id).toBe(
        'DocumentFileVersionDelete'
      );
      expect(Object.keys(model.fileVersionDeleteModel.properties)).toEqual([
        'content'
      ]);
    });

    test('accepts the series options of whole durations', () => {
      expect(() =>
        createModel({
          name: 'Sensor',
          series: { errors: { type: 'int' } },
          seriesOptions: {
            retention: '400d',
            chunkInterval: '1d',
            compressAfter: '12h',
            ingest: 'queue'
          }
        })
      ).not.toThrow();
    });
  });

  describe('update operations', () => {
    const post = (
      operations: Record<string, any>,
      update: Record<string, any> = {}
    ) =>
      createModel({
        name: 'Post',
        scalars: {
          title: { type: 'string' },
          viewCount: { type: 'int', default: 0 },
          score: { type: 'float', required: false },
          likes: { type: 'int', default: 0 }
        },
        update: { ...update, operations }
      } as any);

    test('accepts an increment or a decrement of a numeric field', () => {
      const model = post({
        viewCount: ['increment'],
        score: ['set', 'increment', 'decrement']
      });

      expect(
        Value.Check(model.updateModel, { viewCount: { increment: 1 } })
      ).toBe(true);
      expect(Value.Check(model.updateModel, { viewCount: 3 })).toBe(false);
      expect(
        Value.Check(model.updateModel, { viewCount: { decrement: 1 } })
      ).toBe(false);
      expect(
        Value.Check(model.updateModel, { viewCount: { increment: 0 } })
      ).toBe(false);
      expect(
        Value.Check(model.updateModel, { viewCount: { increment: 1.5 } })
      ).toBe(false);
      expect(
        Value.Check(model.updateModel, {
          viewCount: { increment: 1, decrement: 1 }
        })
      ).toBe(false);
      expect(Value.Check(model.updateModel, { score: 2.5 })).toBe(true);
      expect(
        Value.Check(model.updateModel, { score: { increment: 0.5 } })
      ).toBe(true);
      expect(
        Value.Check(model.updateModel, { score: { decrement: 0.5 } })
      ).toBe(true);
      expect(Value.Check(model.updateModel, { likes: 2 })).toBe(true);
      expect(Value.Check(model.updateModel, { likes: { increment: 1 } })).toBe(
        false
      );
      expect(Value.Check(model.updateModel, {})).toBe(true);
    });

    test('leaves a field without set out of a replacement', () => {
      const model = post({
        viewCount: ['increment'],
        score: ['set', 'increment']
      });

      expect(model.replaceOneModel.properties.viewCount).toBeUndefined();
      expect(model.replaceOneModel.properties.score).toBeDefined();
      expect(model.replaceOneModel.properties.likes).toBeDefined();
    });

    test('rejects the operations of a field that is not a numeric scalar of the update input', () => {
      const invalid = (
        operations: Record<string, any>,
        update?: Record<string, any>
      ) => {
        resetContext();
        return () => post(operations, update);
      };

      for (const run of [
        invalid({ title: ['increment'] }),
        invalid({ missing: ['increment'] }),
        invalid({ viewCount: [] }),
        invalid({ viewCount: ['multiply'] }),
        invalid({ viewCount: ['increment'] }, { omit: ['viewCount'] }),
        invalid({ viewCount: ['increment'] }, { pick: ['title'] })
      ]) {
        expect(run).toThrow(
          expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
        );
      }
    });
  });
});
