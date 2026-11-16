import { createModel } from '@appweaver/data';

/**
 * An area the telemetry watches: entering or leaving it raises an alert, a restricted one a critical alert, and a
 * speed zone lowers the speed limit inside it.
 */
export default createModel({
  name: 'Geofence',
  scalars: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      example: 'West depot'
    },
    kind: {
      type: 'enum',
      values: ['Depot', 'Customer', 'Restricted', 'SpeedZone'],
      example: 'Depot'
    },
    // The limit in km/h inside a speed zone
    speedLimit: {
      type: 'int',
      required: false,
      minimum: 5,
      maximum: 200,
      example: 30
    },
    description: {
      type: 'string',
      required: false,
      maxLength: 1000
    },
    active: {
      type: 'boolean',
      default: true
    }
  },
  geo: {
    area: {
      type: 'polygon',
      description: 'The area, a GeoJSON polygon of [lng, lat] positions',
      example: {
        type: 'Polygon',
        coordinates: [
          [
            [15.875, 45.792],
            [15.885, 45.792],
            [15.885, 45.798],
            [15.875, 45.798],
            [15.875, 45.792]
          ]
        ]
      }
    }
  },
  relations: {
    alerts: {
      model: 'Alert',
      type: 'oneToMany',
      mappedBy: 'geofence',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  index: ['kind']
});
