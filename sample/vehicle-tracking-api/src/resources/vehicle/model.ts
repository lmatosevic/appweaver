import { createModel } from '@appweaver/data';

/** The fields the telemetry writes, never the API. */
const reportedFields = [
  'position',
  'heading',
  'speed',
  'fuelLevel',
  'odometer',
  'ignition',
  'lastSeenAt'
] as const;

/** How long a vehicle counts as online after its last ping. */
const ONLINE_MS = 5 * 60_000;

/**
 * A vehicle of the fleet, carrying a tracker that reports its position and its readings. The last reported state is
 * kept on the vehicle, for the live map, and every reading in its time series, for the history.
 */
export default createModel({
  name: 'Vehicle',
  scalars: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      example: 'Van 07'
    },
    plate: {
      type: 'string',
      unique: true,
      pattern: '^[A-Z0-9-]{3,16}$',
      example: 'ZG-1234-AB'
    },
    // The IMEI of the tracker, which the telematics gateway reports the pings by
    deviceId: {
      type: 'string',
      unique: true,
      pattern: '^[0-9]{15}$',
      example: '356938035643809'
    },
    type: {
      type: 'enum',
      values: ['Car', 'Van', 'Truck', 'Bus'],
      example: 'Van'
    },
    status: {
      type: 'enum',
      values: ['Active', 'Maintenance', 'Retired'],
      default: 'Active'
    },
    // The fuel tank capacity in liters
    fuelCapacity: {
      type: 'float',
      minimum: 1,
      maximum: 2000,
      example: 80
    },
    // The speed in km/h the vehicle may drive at outside the speed zones
    speedLimit: {
      type: 'int',
      default: 90,
      minimum: 10,
      maximum: 200
    },
    // The last reported state, written by the telemetry. The heading in
    // degrees clockwise from the north
    heading: {
      type: 'float',
      required: false,
      minimum: 0,
      maximum: 360
    },
    // In km/h
    speed: {
      type: 'float',
      required: false,
      minimum: 0
    },
    // Percent of the tank
    fuelLevel: {
      type: 'float',
      required: false,
      minimum: 0,
      maximum: 100
    },
    // Kilometers
    odometer: {
      type: 'float',
      required: false,
      minimum: 0
    },
    ignition: {
      type: 'boolean',
      default: false
    },
    lastSeenAt: {
      type: 'dateTime',
      required: false
    }
  },
  geo: {
    position: {
      type: 'point',
      required: false,
      description: 'The last reported position',
      example: { type: 'Point', coordinates: [15.9819, 45.815] }
    }
  },
  relations: {
    driver: {
      model: 'User',
      type: 'manyToOne',
      mappedBy: 'vehicles',
      required: false,
      output: {
        type: 'always'
      }
    },
    // The route the next trip of the vehicle follows
    assignedRoute: {
      model: 'Route',
      type: 'manyToOne',
      mappedBy: 'vehicles',
      required: false,
      output: {
        type: 'single'
      }
    },
    trips: {
      model: 'Trip',
      type: 'oneToMany',
      mappedBy: 'vehicle',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    alerts: {
      model: 'Alert',
      type: 'oneToMany',
      mappedBy: 'vehicle',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  // Every reading of the tracker, in a TimescaleDB hypertable chunked by day,
  // compressed after a week and kept for a year
  series: {
    speed: {
      type: 'float',
      minimum: 0,
      maximum: 300,
      description: 'km/h'
    },
    fuelLevel: {
      type: 'float',
      minimum: 0,
      maximum: 100,
      description: 'Percent of the tank'
    },
    engineTemp: {
      type: 'float',
      minimum: -40,
      maximum: 150,
      description: 'Coolant temperature in degrees Celsius'
    },
    batteryVoltage: {
      type: 'float',
      minimum: 0,
      maximum: 48
    },
    odometer: {
      type: 'float',
      minimum: 0,
      description: 'Kilometers'
    },
    ignition: {
      type: 'boolean'
    }
  },
  seriesOptions: {
    retention: '365d',
    compressAfter: '7d',
    chunkInterval: '1d'
  },
  virtual: {
    online: {
      type: 'boolean',
      input: {
        type: 'none'
      },
      output: {
        value: (vehicle: { lastSeenAt?: Date | string | null }) =>
          !!vehicle.lastSeenAt &&
          Date.now() - new Date(vehicle.lastSeenAt).getTime() < ONLINE_MS
      }
    }
  },
  create: {
    omit: [...reportedFields]
  },
  update: {
    omit: [...reportedFields, 'deviceId']
  },
  export: {
    position: {
      exclude: true
    },
    driver: {
      headerName: 'Driver',
      mapValue: 'email'
    },
    assignedRoute: {
      exclude: true
    }
  },
  index: ['status', 'lastSeenAt']
});
