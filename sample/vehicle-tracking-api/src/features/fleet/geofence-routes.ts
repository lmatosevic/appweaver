import { Type } from '@sinclair/typebox';
import { ErrorCode, GeoPolygon } from '@appweaver/common';
import { injectService } from '@appweaver/core';
import { errorResponses, registerRoute } from '@appweaver/web';
import { Role } from '@/features/access/roles';

const params = Type.Object({ id: Type.Integer() });

registerRoute(
  (router) => {
    // The vehicles parked or driving inside a geofence right now
    router.get(
      '/geofences/:id/vehicles',
      {
        schema: {
          tags: ['Geofences'],
          summary: 'The vehicles inside a geofence',
          description:
            'The vehicles whose last position lies in the area of the geofence, its boundary included.',
          params,
          response: {
            200: Type.Object({
              items: Type.Array(Type.Ref('VehicleMultiple'))
            }),
            ...errorResponses(
              ErrorCode.ResourceNotFound,
              ErrorCode.SpatialTooManyCandidates
            )
          }
        }
      },
      async (req) => {
        const geofence = await injectService('Geofence').find(req.params.id);
        const { items } = await injectService('Vehicle').query({
          filter: { position: { _within: geofence.area } },
          sort: 'name',
          size: 100,
          totalCount: false
        });
        return { items };
      }
    );

    // The trips whose path crossed a geofence, i.e. who drove through a
    // restricted zone last week
    router.get(
      '/geofences/:id/trips',
      {
        schema: {
          tags: ['Geofences'],
          summary: 'The trips through a geofence',
          description:
            'The trips started in the period whose path crosses the area of the geofence, or that started in it, ' +
            'the latest first.',
          params,
          querystring: Type.Object({
            from: Type.Optional(Type.String({ format: 'date-time' })),
            to: Type.Optional(Type.String({ format: 'date-time' })),
            page: Type.Integer({ minimum: 1, default: 1 }),
            size: Type.Integer({ minimum: 1, maximum: 100, default: 20 })
          }),
          response: {
            200: Type.Ref('TripQueryResponse'),
            ...errorResponses(
              ErrorCode.ResourceNotFound,
              ErrorCode.SpatialTooManyCandidates
            )
          }
        }
      },
      async (req) => {
        const { from, to, page, size } = req.query;
        const geofence = await injectService('Geofence').find(req.params.id);
        const area = geofence.area;
        return injectService('Trip').query({
          filter: {
            _or: [
              { path: { _intersects: area } },
              { startPosition: { _within: area } }
            ],
            ...(from || to
              ? {
                  startedAt: {
                    ...(from ? { _gte: from } : {}),
                    ...(to ? { _lt: to } : {})
                  }
                }
              : {})
          },
          sort: '-startedAt',
          page,
          size
        });
      }
    );
  },
  { roles: [Role.Dispatcher, Role.Admin] }
);
