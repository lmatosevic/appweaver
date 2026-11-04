import { Value } from '@sinclair/typebox/value';
import { ErrorCode } from '@appweaver/common';
import { resetContext } from '@appweaver/testing';
import { createModel } from '../../factory/create-model';

describe('create-model', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('createModel', () => {
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
  });
});
