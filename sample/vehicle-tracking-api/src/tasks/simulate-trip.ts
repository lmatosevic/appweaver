import { GeoLineString, GeoPosition } from '@appweaver/common';
import { createTask } from '@appweaver/core';
import db from '@db/client';
import { bearing, interpolateLine } from '@/features/telemetry/geometry';
import { ingestPings, Ping } from '@/features/telemetry/ingest';

/**
 * Drives a vehicle along its assigned route, reporting a ping every few seconds of simulated time as its tracker
 * would, i.e. `weaver run simulate-trip ZG-1234-AB --speed 70`. The trip, the alerts and the readings it records are
 * the ones of a real drive.
 */
export default createTask({
  description:
    'Drives a vehicle along its assigned route, reporting the pings of its tracker.',
  arguments: {
    plate: {
      required: true,
      description: 'The plate of the vehicle, i.e. ZG-1234-AB.'
    }
  },
  options: {
    speed: {
      type: 'number',
      description: 'The cruising speed in km/h (default: 45).'
    },
    interval: {
      type: 'number',
      description: 'The seconds between two pings (default: 10).'
    },
    realtime: {
      type: 'boolean',
      description: 'Wait between the pings instead of reporting them at once.'
    }
  },
  run: async ({ args, options }) => {
    const vehicle = await db.vehicle.findUnique({
      where: { plate: args.plate },
      include: { assignedRoute: true }
    });
    if (!vehicle?.assignedRoute) {
      console.error(
        vehicle
          ? `${vehicle.name} has no assigned route`
          : `No vehicle ${args.plate}`
      );
      return 1;
    }

    const speed = options.speed ?? 45;
    const interval = options.interval ?? 10;
    const route = vehicle.assignedRoute;
    const positions = interpolateLine(
      (route.path as GeoLineString).coordinates,
      (speed / 3.6) * interval
    );
    // Ending now, unless the last ping of the vehicle is more recent
    const start = Math.max(
      Date.now() - (positions.length - 1) * interval * 1000,
      (vehicle.lastSeenAt?.getTime() ?? 0) + interval * 1000
    );
    const pings = simulatePings(vehicle, positions, start, speed, interval);
    console.log(
      `Driving ${vehicle.name} along ${route.code}: ${pings.length} pings, ${interval} s apart`
    );

    let alerts = 0;
    for (const [index, ping] of pings.entries()) {
      if (options.realtime) {
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, interval * 1000));
        }
        ping.time = Date.now();
      }
      const result = await ingestPings([ping]);
      alerts += result.alerts;
    }

    const trip = await db.trip.findFirst({
      where: { vehicleId: vehicle.id },
      orderBy: { startedAt: 'desc' }
    });
    console.log(
      `Trip ${trip?.id}: ${((trip?.distanceMeters ?? 0) / 1000).toFixed(2)} km, ` +
        `${trip?.fuelUsed.toFixed(2)} l of fuel, ${alerts} alerts`
    );
    return 0;
  }
});

/**
 * The pings of a drive through the positions: the ignition on at the first one, slower in the turns, the fuel and the
 * odometer following the distance, and the ignition off at the last one.
 */
function simulatePings(
  vehicle: {
    deviceId: string;
    fuelLevel: number | null;
    odometer: number | null;
  },
  positions: GeoPosition[],
  start: number,
  speed: number,
  interval: number
): Ping[] {
  let fuelLevel = vehicle.fuelLevel ?? 60;
  let odometer = vehicle.odometer ?? 10_000;
  let engineTemp = 40;

  return positions.map((position, index) => {
    const last = index === positions.length - 1;
    const heading =
      index > 0 ? bearing(positions[index - 1], position) : undefined;
    const previousHeading =
      index > 1 ? bearing(positions[index - 2], positions[index - 1]) : heading;
    const turn = Math.abs((heading ?? 0) - (previousHeading ?? 0)) % 360;
    const current =
      index === 0 || last
        ? 0
        : speed * (Math.min(turn, 360 - turn) > 30 ? 0.6 : 1);

    const km = index > 0 ? (current * interval) / 3600 : 0;
    odometer += km;
    fuelLevel = Math.max(0, fuelLevel - km * 0.12);
    engineTemp = Math.min(90, engineTemp + 2.5);

    return {
      deviceId: vehicle.deviceId,
      time: start + index * interval * 1000,
      position,
      speed: Math.round(current * 10) / 10,
      ignition: !last,
      heading: heading === undefined ? undefined : Math.round(heading),
      fuelLevel: Math.round(fuelLevel * 10) / 10,
      engineTemp,
      batteryVoltage: 13.8,
      odometer: Math.round(odometer * 10) / 10
    };
  });
}
