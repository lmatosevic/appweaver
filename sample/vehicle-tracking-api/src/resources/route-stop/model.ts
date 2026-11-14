import { createModel } from '@appweaver/data';

/** A stop of a route, reached when a vehicle on a trip of the route comes within its radius. */
export default createModel({
  name: 'RouteStop',
  scalars: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      example: 'Main square kiosk'
    },
    sequence: {
      type: 'int',
      minimum: 1,
      example: 1
    },
    // How close a vehicle comes to arrive at the stop
    radiusMeters: {
      type: 'int',
      default: 75,
      minimum: 10,
      maximum: 500
    }
  },
  geo: {
    location: {
      type: 'point',
      example: { type: 'Point', coordinates: [15.9773, 45.8131] }
    }
  },
  relations: {
    route: {
      model: 'Route',
      type: 'manyToOne',
      mappedBy: 'stops',
      onDelete: 'cascade',
      output: {
        type: 'single'
      }
    }
  },
  unique: [['routeId', 'sequence']]
});
