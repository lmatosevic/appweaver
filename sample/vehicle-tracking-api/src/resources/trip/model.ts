import { createModel } from '@appweaver/data';

/**
 * A trip of a vehicle, from the ignition turned on to the ignition turned off, recorded by the telemetry: the path it
 * drove, its distance, its top speed, the fuel it used, and the stops of its route it reached.
 */
export default createModel({
  name: 'Trip',
  scalars: {
    status: {
      type: 'enum',
      values: ['Active', 'Completed'],
      default: 'Active'
    },
    startedAt: {
      type: 'dateTime'
    },
    endedAt: {
      type: 'dateTime',
      required: false
    },
    distanceMeters: {
      type: 'float',
      default: 0,
      minimum: 0
    },
    // The top speed in km/h
    maxSpeed: {
      type: 'float',
      default: 0,
      minimum: 0
    },
    // Liters, from the drops of the fuel level
    fuelUsed: {
      type: 'float',
      default: 0,
      minimum: 0
    },
    pings: {
      type: 'int',
      default: 1,
      minimum: 0
    },
    // Whether the last ping was outside the corridor of the route, so leaving
    // it raises one alert
    offRoute: {
      type: 'boolean',
      default: false
    },
    // The ids of the route stops reached, in the order of the arrivals
    visitedStopIds: {
      type: 'int',
      array: true,
      default: []
    },
    endReason: {
      type: 'enum',
      values: ['IgnitionOff', 'SignalLost'],
      required: false
    }
  },
  geo: {
    startPosition: {
      type: 'point'
    },
    endPosition: {
      type: 'point',
      required: false
    },
    // The positions driven, from the second ping on, so it may be empty
    path: {
      type: 'lineString',
      required: false,
      description: 'The path driven, a GeoJSON line string'
    }
  },
  relations: {
    vehicle: {
      model: 'Vehicle',
      type: 'manyToOne',
      mappedBy: 'trips',
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    },
    driver: {
      model: 'User',
      type: 'manyToOne',
      mappedBy: 'trips',
      required: false,
      output: {
        type: 'single'
      }
    },
    route: {
      model: 'Route',
      type: 'manyToOne',
      mappedBy: 'trips',
      required: false,
      onDelete: 'setNull',
      output: {
        type: 'single'
      }
    },
    alerts: {
      model: 'Alert',
      type: 'oneToMany',
      mappedBy: 'trip',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    }
  },
  virtual: {
    durationSeconds: {
      type: 'int',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        value: (trip: { startedAt: Date | string; endedAt?: Date | string }) =>
          trip.endedAt
            ? Math.round(
                (new Date(trip.endedAt).getTime() -
                  new Date(trip.startedAt).getTime()) /
                  1000
              )
            : null
      }
    }
  },
  export: {
    startPosition: {
      exclude: true
    },
    endPosition: {
      exclude: true
    },
    path: {
      exclude: true
    },
    visitedStopIds: {
      exclude: true
    },
    vehicle: {
      headerName: 'Vehicle',
      mapValue: 'plate'
    },
    driver: {
      headerName: 'Driver',
      mapValue: 'email'
    },
    route: {
      headerName: 'Route',
      mapValue: 'code'
    }
  },
  index: [
    ['vehicleId', '-startedAt'],
    ['status', 'startedAt']
  ]
});
