/** How far in km/h a vehicle may drive above the limit before it is speeding, the error of a tracker. */
export const SPEED_TOLERANCE = 5;

/** The fuel level in percent a vehicle is low on fuel below. */
export const LOW_FUEL_LEVEL = 15;

/** The minutes without a ping a trip ends after, its tracker lost. */
export const SIGNAL_LOST_MINUTES = 30;

/** A zone the speed limit may come from. */
export type SpeedZone = {
  id: number;
  kind: string;
  speedLimit?: number | null;
};

/**
 * The speed limit at a position: the lowest of the limit of the vehicle and the limits of the speed zones it is in,
 * with the zone setting it.
 */
export function speedLimitAt<Z extends SpeedZone>(
  vehicleLimit: number,
  zones: Z[]
): { limit: number; zone?: Z } {
  let result: { limit: number; zone?: Z } = { limit: vehicleLimit };
  for (const zone of zones) {
    if (
      zone.kind === 'SpeedZone' &&
      zone.speedLimit != null &&
      zone.speedLimit < result.limit
    ) {
      result = { limit: zone.speedLimit, zone };
    }
  }
  return result;
}

/** Whether a speed is above a limit, past the tolerance. */
export function isSpeeding(speed: number | null | undefined, limit: number) {
  return speed != null && speed > limit + SPEED_TOLERANCE;
}

/** Whether a fuel level fell below the low level since the previous one, an unknown previous level counting as full. */
export function fellBelowLowFuel(
  previous: number | null | undefined,
  level: number | null | undefined
): boolean {
  return (
    level != null &&
    level < LOW_FUEL_LEVEL &&
    (previous == null || previous >= LOW_FUEL_LEVEL)
  );
}

/** The liters used between two fuel levels in percent of the tank, nothing for a refuel. */
export function fuelUsed(
  capacity: number,
  previous: number | null | undefined,
  level: number | null | undefined
): number {
  if (previous == null || level == null || level >= previous) {
    return 0;
  }
  return ((previous - level) / 100) * capacity;
}

/** The members of a list of zones missing from another one, by id. */
export function zonesMissing<Z extends { id: number }>(
  zones: Z[],
  from: Z[]
): Z[] {
  const ids = new Set(from.map((zone) => zone.id));
  return zones.filter((zone) => !ids.has(zone.id));
}

/** Rounds a reading for a message. */
export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
