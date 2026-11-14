import { Type } from '@sinclair/typebox';
import { registerRoute } from '@appweaver/web';
import { Role } from '@/features/access/roles';
import { ingestPings } from './ingest';

const Ping = Type.Object({
  deviceId: Type.String({ pattern: '^[0-9]{15}$', example: '356938035643809' }),
  time: Type.Optional(
    Type.Union([Type.String({ format: 'date-time' }), Type.Integer()], {
      description: 'ISO 8601 or milliseconds since the epoch, now by default'
    })
  ),
  position: Type.Union(
    [
      Type.Tuple([
        Type.Number({ minimum: -180, maximum: 180 }),
        Type.Number({ minimum: -90, maximum: 90 })
      ]),
      Type.Object({
        lat: Type.Number({ minimum: -90, maximum: 90 }),
        lng: Type.Number({ minimum: -180, maximum: 180 })
      })
    ],
    { description: '[lng, lat] or { lat, lng }', example: [15.9819, 45.815] }
  ),
  speed: Type.Number({ minimum: 0, maximum: 300, description: 'km/h' }),
  ignition: Type.Boolean(),
  heading: Type.Optional(Type.Number({ minimum: 0, maximum: 360 })),
  fuelLevel: Type.Optional(
    Type.Number({ minimum: 0, maximum: 100, description: 'Percent' })
  ),
  engineTemp: Type.Optional(
    Type.Number({ minimum: -40, maximum: 150, description: 'Celsius' })
  ),
  batteryVoltage: Type.Optional(Type.Number({ minimum: 0, maximum: 48 })),
  odometer: Type.Optional(Type.Number({ minimum: 0, description: 'km' }))
});

// The telematics gateway forwards the pings of the trackers with its API key,
// an admin may replay them while testing
registerRoute(
  (router) => {
    router.post(
      '/telemetry',
      {
        schema: {
          tags: ['Telemetry'],
          summary: 'Report the pings of the trackers',
          description:
            'Moves the vehicles, starts and ends their trips with the ignition, raises the alerts, and records ' +
            'the readings in the time series of each vehicle. A ping older than the last one of its vehicle is ' +
            'recorded in its history only.',
          body: Type.Object({
            pings: Type.Array(Ping, { minItems: 1, maxItems: 500 })
          }),
          response: {
            200: Type.Object({
              accepted: Type.Integer(),
              stale: Type.Integer(),
              rejected: Type.Array(
                Type.Object({
                  index: Type.Integer(),
                  deviceId: Type.String(),
                  reason: Type.String()
                })
              ),
              alerts: Type.Integer()
            })
          }
        }
      },
      async (req) => ingestPings(req.body.pings)
    );
  },
  {
    auth: ['apiKey', 'jwt'],
    roles: [Role.Tracker, Role.Admin],
    rateLimit: { max: 600, timeWindow: '1 minute' }
  }
);
