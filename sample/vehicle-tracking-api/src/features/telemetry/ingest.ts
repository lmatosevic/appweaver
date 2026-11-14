import {
  createLogger,
  geoDistance,
  geometryDistance,
  GeoLineString,
  GeoPoint,
  GeoPosition
} from '@appweaver/common';
import { inject, injectService, TimeSeriesService } from '@appweaver/core';
import { runTransaction } from '@appweaver/data';
import db from '@db/client';
import { Prisma } from '@db/client/client';
import { bearing, extendPath } from './geometry';
import {
  fellBelowLowFuel,
  fuelUsed,
  isSpeeding,
  round,
  speedLimitAt,
  zonesMissing
} from './rules';

const logger = createLogger('telemetry');

/** A reading of a tracker, as the telematics gateway reports it. */
export type Ping = {
  /** The IMEI of the tracker */
  deviceId: string;
  /** When it was measured, now by default */
  time?: string | number | Date;
  /** Where the vehicle is, `[lng, lat]` or `{ lat, lng }` */
  position: GeoPosition | { lat: number; lng: number };
  /** km/h */
  speed: number;
  ignition: boolean;
  /** Degrees clockwise from the north, from the previous position when left out */
  heading?: number;
  /** Percent of the tank */
  fuelLevel?: number;
  /** Degrees Celsius */
  engineTemp?: number;
  batteryVoltage?: number;
  /** Kilometers */
  odometer?: number;
};

/** What an ingestion did. */
export type IngestResult = {
  /** The pings applied to their vehicles */
  accepted: number;
  /** The pings older than the last one of their vehicle, kept in its history only */
  stale: number;
  /** The pings of an unknown or retired tracker, by their index */
  rejected: { index: number; deviceId: string; reason: string }[];
  /** The alerts raised */
  alerts: number;
};

type Zone = {
  id: number;
  name: string;
  kind: string;
  speedLimit?: number | null;
};

type AlertData = {
  type: Prisma.AlertCreateInput['type'];
  severity: Prisma.AlertCreateInput['severity'];
  message: string;
  value?: number;
  geofenceId?: number;
  tripId?: number;
};

/**
 * Applies the pings of the trackers to their vehicles: their position and last readings, their trips, and the alerts
 * the pings raise, then records every reading in the time series of the vehicle. The pings are applied in the order
 * of their time, each in a transaction locking its vehicle, so concurrent requests of a vehicle apply one after the
 * other.
 */
export async function ingestPings(pings: Ping[]): Promise<IngestResult> {
  const result: IngestResult = {
    accepted: 0,
    stale: 0,
    rejected: [],
    alerts: 0
  };

  const deviceIds = [...new Set(pings.map((ping) => ping.deviceId))];
  const vehicles = await db.vehicle.findMany({
    where: { deviceId: { in: deviceIds }, status: { not: 'Retired' } },
    select: { id: true, deviceId: true }
  });
  const vehicleIds = new Map(vehicles.map((v) => [v.deviceId, v.id]));

  const ordered = pings
    .map((ping, index) => ({ ping, index, time: pingTime(ping) }))
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  const points: Parameters<TimeSeriesService['write']>[1] = [];
  for (const { ping, index, time } of ordered) {
    const vehicleId = vehicleIds.get(ping.deviceId);
    if (vehicleId === undefined) {
      result.rejected.push({
        index,
        deviceId: ping.deviceId,
        reason: 'Unknown or retired tracker'
      });
      continue;
    }

    const applied = await runTransaction((tx: Prisma.TransactionClient) =>
      applyPing(tx, vehicleId, ping, time)
    );
    if (applied === null) {
      result.stale++;
    } else {
      result.accepted++;
      result.alerts += applied;
    }
    points.push({ resourceId: vehicleId, time, values: seriesValues(ping) });
  }

  if (points.length > 0) {
    await inject(TimeSeriesService).write('Vehicle', points);
  }
  return result;
}

/**
 * Applies a ping to its vehicle, returning the number of alerts raised, or `null` for a ping older than the last one
 * of the vehicle.
 */
async function applyPing(
  tx: Prisma.TransactionClient,
  vehicleId: number,
  ping: Ping,
  time: Date
): Promise<number | null> {
  // Locks the vehicle until the commit, so its pings apply one at a time
  await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${vehicleId} FOR UPDATE`;
  const vehicle = await tx.vehicle.findUniqueOrThrow({
    where: { id: vehicleId }
  });
  if (vehicle.lastSeenAt && time <= vehicle.lastSeenAt) {
    return null;
  }

  const position = toPosition(ping.position);
  const point: GeoPoint = { type: 'Point', coordinates: position };
  const previousPosition = (vehicle.position as GeoPoint | null)?.coordinates;
  const alerts: AlertData[] = [];

  // The geofences entered and left since the previous ping
  const zones = await zonesAt(position);
  const previousZones = previousPosition ? await zonesAt(previousPosition) : [];
  for (const zone of zonesMissing(zones, previousZones)) {
    alerts.push(
      zone.kind === 'Restricted'
        ? {
            type: 'RestrictedZone',
            severity: 'Critical',
            message: `${vehicle.name} entered the restricted zone ${zone.name}`,
            geofenceId: zone.id
          }
        : {
            type: 'GeofenceEnter',
            severity: 'Info',
            message: `${vehicle.name} entered ${zone.name}`,
            geofenceId: zone.id
          }
    );
  }
  for (const zone of zonesMissing(previousZones, zones)) {
    alerts.push({
      type: 'GeofenceExit',
      severity: 'Info',
      message: `${vehicle.name} left ${zone.name}`,
      geofenceId: zone.id
    });
  }

  // Speeding, raised once when the vehicle goes above the limit
  const { limit, zone: speedZone } = speedLimitAt(vehicle.speedLimit, zones);
  const previousLimit = speedLimitAt(vehicle.speedLimit, previousZones).limit;
  if (
    isSpeeding(ping.speed, limit) &&
    !isSpeeding(vehicle.speed, previousLimit)
  ) {
    alerts.push({
      type: 'Speeding',
      severity: 'Warning',
      message:
        `${vehicle.name} drove ${round(ping.speed)} km/h` +
        (speedZone ? ` in ${speedZone.name}` : '') +
        ` (limit ${limit} km/h)`,
      value: ping.speed,
      geofenceId: speedZone?.id
    });
  }

  if (fellBelowLowFuel(vehicle.fuelLevel, ping.fuelLevel)) {
    alerts.push({
      type: 'LowFuel',
      severity: 'Warning',
      message: `${vehicle.name} is low on fuel (${round(ping.fuelLevel!)} %)`,
      value: ping.fuelLevel
    });
  }

  const tripId = await updateTrip(tx, vehicle, ping, time, point, alerts);

  await tx.vehicle.update({
    where: { id: vehicleId },
    data: {
      position: point,
      heading:
        ping.heading ??
        (previousPosition && geoDistance(previousPosition, position) > 1
          ? round(bearing(previousPosition, position), 1)
          : vehicle.heading),
      speed: ping.speed,
      fuelLevel: ping.fuelLevel ?? vehicle.fuelLevel,
      odometer: ping.odometer ?? vehicle.odometer,
      ignition: ping.ignition,
      lastSeenAt: time
    }
  });

  for (const alert of alerts) {
    await tx.alert.create({
      data: {
        ...alert,
        tripId: alert.tripId ?? tripId,
        vehicleId,
        position: point,
        occurredAt: time
      }
    });
    if (alert.severity === 'Critical') {
      logger.warn(alert.message);
    }
  }
  return alerts.length;
}

/**
 * Starts a trip when the ignition turns on, extends the active one with the ping, checks it against its route, and
 * ends it when the ignition turns off. Returns the id of the trip the ping belongs to.
 */
async function updateTrip(
  tx: Prisma.TransactionClient,
  vehicle: Prisma.VehicleGetPayload<object>,
  ping: Ping,
  time: Date,
  point: GeoPoint,
  alerts: AlertData[]
): Promise<number | undefined> {
  let trip = await tx.trip.findFirst({
    where: { vehicleId: vehicle.id, status: 'Active' }
  });

  if (!trip) {
    if (!ping.ignition) {
      return undefined;
    }
    trip = await tx.trip.create({
      data: {
        vehicleId: vehicle.id,
        driverId: vehicle.driverId,
        routeId: vehicle.assignedRouteId,
        startedAt: time,
        startPosition: point,
        maxSpeed: ping.speed
      }
    });
  } else {
    const vertices = (trip.path as GeoLineString | null)?.coordinates ?? [
      (trip.startPosition as GeoPoint).coordinates
    ];
    const extended = extendPath(vertices, point.coordinates);
    trip = await tx.trip.update({
      where: { id: trip.id },
      data: {
        path:
          extended.vertices.length >= 2
            ? { type: 'LineString', coordinates: extended.vertices }
            : undefined,
        distanceMeters: { increment: extended.added },
        maxSpeed: Math.max(trip.maxSpeed, ping.speed),
        fuelUsed: {
          increment: fuelUsed(
            vehicle.fuelCapacity,
            vehicle.fuelLevel,
            ping.fuelLevel
          )
        },
        pings: { increment: 1 }
      }
    });
  }

  if (trip.routeId) {
    await checkRoute(tx, trip, vehicle.name, point.coordinates, alerts);
  }

  if (!ping.ignition) {
    await tx.trip.update({
      where: { id: trip.id },
      data: {
        status: 'Completed',
        endedAt: time,
        endPosition: point,
        endReason: 'IgnitionOff'
      }
    });
  }
  return trip.id;
}

/** Raises the alerts of a trip leaving the corridor of its route, and of the stops it reaches. */
async function checkRoute(
  tx: Prisma.TransactionClient,
  trip: Prisma.TripGetPayload<object>,
  vehicleName: string,
  position: GeoPosition,
  alerts: AlertData[]
): Promise<void> {
  const route = await tx.route.findUniqueOrThrow({
    where: { id: trip.routeId! },
    include: { stops: { orderBy: { sequence: 'asc' } } }
  });

  const distance = geometryDistance(route.path as GeoLineString, position);
  const offRoute = distance > route.corridorMeters;
  if (offRoute && !trip.offRoute) {
    alerts.push({
      type: 'OffRoute',
      severity: 'Warning',
      message: `${vehicleName} left the route ${route.code}, ${round(distance)} m away`,
      value: round(distance),
      tripId: trip.id
    });
  }

  const reached = route.stops.filter(
    (stop) =>
      !trip.visitedStopIds.includes(stop.id) &&
      geoDistance((stop.location as GeoPoint).coordinates, position) <=
        stop.radiusMeters
  );
  for (const stop of reached) {
    alerts.push({
      type: 'StopArrival',
      severity: 'Info',
      message: `${vehicleName} reached stop ${stop.sequence} of ${route.code}, ${stop.name}`,
      tripId: trip.id
    });
  }

  if (offRoute !== trip.offRoute || reached.length > 0) {
    await tx.trip.update({
      where: { id: trip.id },
      data: {
        offRoute,
        visitedStopIds: [...trip.visitedStopIds, ...reached.map((s) => s.id)]
      }
    });
  }
}

/** The active geofences covering a position, through the `_intersects` filter of their area. */
async function zonesAt(position: GeoPosition): Promise<Zone[]> {
  const { items } = await injectService('Geofence').query({
    filter: {
      active: true,
      area: { _intersects: { type: 'Point', coordinates: position } }
    },
    size: 100,
    totalCount: false
  });
  return items;
}

/** The time of a ping, now when it has none. */
function pingTime(ping: Ping): Date {
  return ping.time === undefined ? new Date() : new Date(ping.time);
}

function toPosition(position: Ping['position']): GeoPosition {
  return Array.isArray(position) ? position : [position.lng, position.lat];
}

/** The readings of a ping its vehicle records in its time series. */
function seriesValues(ping: Ping) {
  const { speed, ignition, fuelLevel, engineTemp, batteryVoltage, odometer } =
    ping;
  return Object.fromEntries(
    Object.entries({
      speed,
      ignition,
      fuelLevel,
      engineTemp,
      batteryVoltage,
      odometer
    }).filter(([, value]) => value !== undefined)
  );
}
