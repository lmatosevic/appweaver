import { Type } from '@sinclair/typebox';
import { injectService } from '@appweaver/core';
import { registerRoute } from '@appweaver/web';
import { Role } from '@/features/access/roles';

/** The average speed in km/h of a vehicle in the city, for the arrival estimate. */
const CITY_SPEED = 30;

/** How much longer the roads are than the straight line, on average. */
const ROAD_FACTOR = 1.4;

// The dispatcher sends the nearest free vehicle to a job: the active vehicles
// within a radius of it, without a trip under way, nearest first
registerRoute(
  (router) => {
    router.get(
      '/vehicles/nearest',
      {
        schema: {
          tags: ['Fleet'],
          summary: 'The nearest free vehicles to a place',
          description:
            'The active vehicles without an active trip, within the radius, nearest first. The arrival estimate ' +
            `takes the roads ${ROAD_FACTOR} times longer than the straight line, driven at ${CITY_SPEED} km/h.`,
          querystring: Type.Object({
            lat: Type.Number({ minimum: -90, maximum: 90, example: 45.8131 }),
            lng: Type.Number({ minimum: -180, maximum: 180, example: 15.9773 }),
            radius: Type.Integer({
              minimum: 100,
              maximum: 50_000,
              default: 10_000,
              description: 'Meters'
            }),
            limit: Type.Integer({ minimum: 1, maximum: 20, default: 5 })
          }),
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  vehicle: Type.Ref('VehicleMultiple'),
                  distanceMeters: Type.Number(),
                  etaMinutes: Type.Integer()
                })
              )
            })
          }
        }
      },
      async (req) => {
        const { lat, lng, radius, limit } = req.query;
        const { items } = await injectService('Vehicle').query({
          filter: {
            status: 'Active',
            trips: { _none: { status: 'Active' } },
            position: {
              _near: { point: { lat, lng }, maxDistance: radius }
            }
          },
          sort: 'position',
          size: limit,
          totalCount: false
        });

        return {
          items: items.map((vehicle) => {
            const distance = vehicle.positionDistance ?? 0;
            return {
              vehicle,
              distanceMeters: Math.round(distance),
              etaMinutes: Math.ceil(
                (distance * ROAD_FACTOR) / ((CITY_SPEED * 1000) / 60)
              )
            };
          })
        };
      }
    );
  },
  { roles: [Role.Dispatcher, Role.Admin] }
);
