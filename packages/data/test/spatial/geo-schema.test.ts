import { Value } from '@sinclair/typebox/value';
import { geoFieldSchema, geometrySchema } from '../../spatial/geo-schema';

const point = { type: 'Point', coordinates: [15.9, 45.8] };
const line = {
  type: 'LineString',
  coordinates: [
    [0, 0],
    [1, 1]
  ]
};

describe('geo-schema', () => {
  describe('geometrySchema', () => {
    test('checks the coordinates of a geometry type', () => {
      expect(Value.Check(geometrySchema('Point'), point)).toBe(true);
      expect(Value.Check(geometrySchema('Point'), line)).toBe(false);
      expect(Value.Check(geometrySchema('LineString'), line)).toBe(true);
      expect(
        Value.Check(geometrySchema('Point'), {
          type: 'Point',
          coordinates: [15.9, 91]
        })
      ).toBe(false);
      // A ring of fewer than four positions
      expect(
        Value.Check(geometrySchema('Polygon'), {
          type: 'Polygon',
          coordinates: [line.coordinates]
        })
      ).toBe(false);
    });
  });

  describe('geoFieldSchema', () => {
    test('takes the geometries of the field type', () => {
      const schema = geoFieldSchema({ type: 'point', description: 'Where' });
      expect(Value.Check(schema, point)).toBe(true);
      expect(Value.Check(schema, { lat: 45.8, lng: 15.9 })).toBe(false);
      expect(Value.Check(schema, null)).toBe(false);
      expect(schema.description).toBe('Where');

      const any = geoFieldSchema({ type: 'geometry' });
      expect(Value.Check(any, point)).toBe(true);
      expect(Value.Check(any, line)).toBe(true);
    });

    test('takes a { lat, lng } as the input of a field holding points', () => {
      const latLng = { lat: 45.8, lng: 15.9 };
      expect(Value.Check(geoFieldSchema({ type: 'point' }, true), latLng)).toBe(
        true
      );
      expect(
        Value.Check(geoFieldSchema({ type: 'geometry' }, true), latLng)
      ).toBe(true);
      expect(
        Value.Check(geoFieldSchema({ type: 'polygon' }, true), latLng)
      ).toBe(false);
    });

    test('keeps a nullable field nullable and a hidden one hidden', () => {
      for (const type of ['point', 'geometry'] as const) {
        const schema = geoFieldSchema(
          { type, required: false, hidden: true },
          true
        );
        expect(Value.Check(schema, null)).toBe(true);
        expect(Value.Check(schema, point)).toBe(true);
        expect(schema.hidden).toBe(true);
      }
    });
  });
});
