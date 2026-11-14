import { createModel } from '@appweaver/data';
import { GeoLineString } from '@appweaver/common';
// Relative, as weaver generate loads the models without the path aliases
import { lineLength } from '../../features/telemetry/geometry';

/**
 * A planned route: the line a vehicle follows and its stops. A trip of a vehicle assigned to it raises an alert when
 * the vehicle leaves its corridor, and records its arrivals at the stops.
 */
export default createModel({
  name: 'Route',
  scalars: {
    code: {
      type: 'string',
      unique: true,
      pattern: '^[A-Z0-9-]{2,20}$',
      example: 'ZG-CENTER'
    },
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      example: 'City center deliveries'
    },
    description: {
      type: 'string',
      required: false,
      maxLength: 1000
    },
    // How far from the path a vehicle may drive before it is off the route
    corridorMeters: {
      type: 'int',
      default: 250,
      minimum: 20,
      maximum: 5000
    }
  },
  geo: {
    path: {
      type: 'lineString',
      description: 'The path, a GeoJSON line string of [lng, lat] positions'
    }
  },
  relations: {
    stops: {
      model: 'RouteStop',
      type: 'oneToMany',
      mappedBy: 'route',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        count: true
      }
    },
    vehicles: {
      model: 'Vehicle',
      type: 'oneToMany',
      mappedBy: 'assignedRoute',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    },
    trips: {
      model: 'Trip',
      type: 'oneToMany',
      mappedBy: 'route',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  virtual: {
    lengthMeters: {
      type: 'float',
      input: {
        type: 'none'
      },
      output: {
        value: (route: { path: GeoLineString }) =>
          Math.round(lineLength(route.path.coordinates))
      }
    }
  }
});
