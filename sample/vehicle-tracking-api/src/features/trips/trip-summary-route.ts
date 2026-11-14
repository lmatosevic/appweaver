import { Type } from '@sinclair/typebox';
import { ErrorCode, GeoLineString } from '@appweaver/common';
import { inject, injectService, TimeSeriesService } from '@appweaver/core';
import { errorResponses, registerRoute } from '@appweaver/web';
import { Role } from '@/features/access/roles';
import { round } from '@/features/telemetry/rules';

const Nullable = <T extends ReturnType<typeof Type.Number>>(schema: T) =>
  Type.Union([schema, Type.Null()]);

/**
 * The report of a trip: what the trip recorded, and the readings of its vehicle over its time range, aggregated from
 * the time series.
 */
registerRoute(
  (router) => {
    router.get(
      '/trips/:id/summary',
      {
        schema: {
          tags: ['Trips'],
          summary: 'The report of a trip',
          description:
            'The distance, duration and fuel of the trip, with the readings of its vehicle aggregated over the ' +
            'trip from its time series, and its speed profile in buckets of `bucket` (5 minutes by default).',
          params: Type.Object({ id: Type.Integer() }),
          querystring: Type.Object({
            bucket: Type.String({
              pattern: '^[0-9]+(s|m|h)$',
              default: '5m',
              example: '1m'
            })
          }),
          response: {
            200: Type.Object({
              tripId: Type.Integer(),
              vehicleId: Type.Integer(),
              status: Type.String(),
              startedAt: Type.String({ format: 'date-time' }),
              endedAt: Type.Union([
                Type.String({ format: 'date-time' }),
                Type.Null()
              ]),
              durationSeconds: Type.Integer(),
              distanceKm: Type.Number(),
              vertices: Type.Integer(),
              averageSpeed: Type.Number({
                description: 'km/h, over the duration'
              }),
              maxSpeed: Type.Number(),
              fuelUsed: Type.Number({ description: 'Liters' }),
              fuelPer100Km: Nullable(Type.Number()),
              engineTemp: Type.Object({
                avg: Nullable(Type.Number()),
                max: Nullable(Type.Number())
              }),
              minBatteryVoltage: Nullable(Type.Number()),
              fuelLevel: Type.Object({
                start: Nullable(Type.Number()),
                end: Nullable(Type.Number())
              }),
              speedProfile: Type.Array(
                Type.Object({
                  time: Type.String({ format: 'date-time' }),
                  avg: Type.Number(),
                  max: Type.Number()
                })
              )
            }),
            ...errorResponses(ErrorCode.ResourceNotFound)
          }
        }
      },
      async (req) => {
        // Through the trip service, so drivers read only their own trips
        const trip = await injectService('Trip').find(req.params.id);
        const startedAt = new Date(trip.startedAt);
        const endedAt = trip.endedAt ? new Date(trip.endedAt) : null;
        const to = new Date((endedAt ?? new Date()).getTime() + 1);

        const series = inject(TimeSeriesService);
        const range = { resourceIds: [trip.vehicle.id], from: startedAt, to };
        const aggregate = async (
          fields: ('speed' | 'engineTemp' | 'batteryVoltage' | 'fuelLevel')[],
          kind: 'avg' | 'max' | 'min' | 'first' | 'last'
        ) =>
          (
            await series.query('Vehicle', { ...range, fields, aggregate: kind })
          )[0]?.values ?? {};

        const [avg, max, min, first, last, avgProfile, maxProfile] =
          await Promise.all([
            aggregate(['engineTemp'], 'avg'),
            aggregate(['engineTemp'], 'max'),
            aggregate(['batteryVoltage'], 'min'),
            aggregate(['fuelLevel'], 'first'),
            aggregate(['fuelLevel'], 'last'),
            series.query('Vehicle', {
              ...range,
              fields: ['speed'],
              bucket: req.query.bucket,
              aggregate: 'avg'
            }),
            series.query('Vehicle', {
              ...range,
              fields: ['speed'],
              bucket: req.query.bucket,
              aggregate: 'max'
            })
          ]);

        const durationSeconds = Math.round(
          ((endedAt ?? new Date()).getTime() - startedAt.getTime()) / 1000
        );
        const distanceKm = trip.distanceMeters / 1000;
        const maxByTime = new Map(
          maxProfile.map((point) => [point.time.getTime(), point.values.speed])
        );
        const nullable = (value: number | boolean | null | undefined) =>
          typeof value === 'number' ? round(value, 1) : null;

        return {
          tripId: trip.id,
          vehicleId: trip.vehicle.id,
          status: trip.status,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt?.toISOString() ?? null,
          durationSeconds,
          distanceKm: round(distanceKm, 2),
          vertices:
            (trip.path as GeoLineString | null)?.coordinates.length ?? 0,
          averageSpeed:
            durationSeconds > 0
              ? round(distanceKm / (durationSeconds / 3600), 1)
              : 0,
          maxSpeed: round(trip.maxSpeed, 1),
          fuelUsed: round(trip.fuelUsed, 2),
          fuelPer100Km:
            distanceKm >= 1
              ? round((trip.fuelUsed / distanceKm) * 100, 1)
              : null,
          engineTemp: {
            avg: nullable(avg.engineTemp),
            max: nullable(max.engineTemp)
          },
          minBatteryVoltage: nullable(min.batteryVoltage),
          fuelLevel: {
            start: nullable(first.fuelLevel),
            end: nullable(last.fuelLevel)
          },
          speedProfile: avgProfile.map((point) => ({
            time: point.time.toISOString(),
            avg: round(Number(point.values.speed ?? 0), 1),
            max: round(Number(maxByTime.get(point.time.getTime()) ?? 0), 1)
          }))
        };
      }
    );
  },
  { roles: [Role.Dispatcher, Role.Admin, Role.Driver] }
);
