import { createModel } from '@appweaver/data';

/**
 * What the telemetry noticed about a vehicle, where it happened. The warnings and the critical alerts wait for a
 * dispatcher to acknowledge them, the informative ones (a geofence entered, a stop reached) do not.
 */
export default createModel({
  name: 'Alert',
  scalars: {
    type: {
      type: 'enum',
      values: [
        'GeofenceEnter',
        'GeofenceExit',
        'RestrictedZone',
        'Speeding',
        'OffRoute',
        'StopArrival',
        'LowFuel',
        'SignalLost'
      ]
    },
    severity: {
      type: 'enum',
      values: ['Info', 'Warning', 'Critical']
    },
    message: {
      type: 'string',
      maxLength: 500,
      example: 'Van 07 drove 74 km/h in the School zone Savica (limit 30 km/h)'
    },
    // The reading that raised the alert, i.e. the speed or the fuel level
    value: {
      type: 'float',
      required: false
    },
    occurredAt: {
      type: 'dateTime'
    },
    acknowledgedAt: {
      type: 'dateTime',
      required: false
    }
  },
  geo: {
    position: {
      type: 'point',
      required: false
    }
  },
  relations: {
    vehicle: {
      model: 'Vehicle',
      type: 'manyToOne',
      mappedBy: 'alerts',
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    },
    trip: {
      model: 'Trip',
      type: 'manyToOne',
      mappedBy: 'alerts',
      required: false,
      onDelete: 'setNull',
      output: {
        type: 'none'
      }
    },
    geofence: {
      model: 'Geofence',
      type: 'manyToOne',
      mappedBy: 'alerts',
      required: false,
      onDelete: 'setNull',
      output: {
        type: 'single'
      }
    },
    acknowledgedBy: {
      model: 'User',
      type: 'manyToOne',
      mappedBy: 'acknowledgedAlerts',
      required: false,
      onDelete: 'setNull',
      output: {
        type: 'single'
      }
    }
  },
  virtual: {
    open: {
      type: 'boolean',
      input: {
        type: 'none'
      },
      output: {
        value: (alert: { severity: string; acknowledgedAt?: Date | null }) =>
          alert.severity !== 'Info' && !alert.acknowledgedAt
      }
    }
  },
  export: {
    position: {
      exclude: true
    },
    vehicle: {
      headerName: 'Vehicle',
      mapValue: 'plate'
    },
    geofence: {
      headerName: 'Geofence',
      mapValue: 'name'
    },
    acknowledgedBy: {
      headerName: 'Acknowledged by',
      mapValue: 'email'
    }
  },
  index: [
    ['vehicleId', '-occurredAt'],
    ['severity', 'acknowledgedAt', '-occurredAt']
  ]
});
