import {
  fellBelowLowFuel,
  fuelUsed,
  isSpeeding,
  LOW_FUEL_LEVEL,
  SPEED_TOLERANCE,
  speedLimitAt,
  zonesMissing
} from '@/features/telemetry/rules';

describe('speedLimitAt', () => {
  const school = { id: 1, kind: 'SpeedZone', speedLimit: 30 };
  const city = { id: 2, kind: 'SpeedZone', speedLimit: 50 };
  const depot = { id: 3, kind: 'Depot', speedLimit: 10 };

  test('is the limit of the vehicle outside the speed zones', () => {
    expect(speedLimitAt(90, [])).toEqual({ limit: 90 });
  });

  test('is the lowest limit of the speed zones', () => {
    expect(speedLimitAt(90, [city, school])).toEqual({
      limit: 30,
      zone: school
    });
  });

  test('ignores the limit of the other zones', () => {
    expect(speedLimitAt(90, [depot])).toEqual({ limit: 90 });
  });

  test('keeps a vehicle limit below the zone limit', () => {
    expect(speedLimitAt(40, [city])).toEqual({ limit: 40 });
  });
});

describe('isSpeeding', () => {
  test('allows the tolerance above the limit', () => {
    expect(isSpeeding(50 + SPEED_TOLERANCE, 50)).toBe(false);
    expect(isSpeeding(50 + SPEED_TOLERANCE + 0.1, 50)).toBe(true);
  });

  test('is false without a speed', () => {
    expect(isSpeeding(null, 50)).toBe(false);
    expect(isSpeeding(undefined, 50)).toBe(false);
  });
});

describe('fellBelowLowFuel', () => {
  test('is true when the level crosses the low level', () => {
    expect(fellBelowLowFuel(20, LOW_FUEL_LEVEL - 1)).toBe(true);
    expect(fellBelowLowFuel(null, LOW_FUEL_LEVEL - 1)).toBe(true);
  });

  test('is false when it was already low, or is not low', () => {
    expect(fellBelowLowFuel(10, 9)).toBe(false);
    expect(fellBelowLowFuel(30, LOW_FUEL_LEVEL)).toBe(false);
    expect(fellBelowLowFuel(30, undefined)).toBe(false);
  });
});

describe('fuelUsed', () => {
  test('converts the drop of the level into liters of the tank', () => {
    expect(fuelUsed(80, 50, 45)).toBeCloseTo(4);
  });

  test('counts nothing for a refuel or an unknown level', () => {
    expect(fuelUsed(80, 20, 90)).toBe(0);
    expect(fuelUsed(80, null, 40)).toBe(0);
    expect(fuelUsed(80, 40, undefined)).toBe(0);
  });
});

describe('zonesMissing', () => {
  test('returns the zones not in the other list, by id', () => {
    const [a, b, c] = [{ id: 1 }, { id: 2 }, { id: 3 }];

    expect(zonesMissing([a, b], [b, c])).toEqual([a]);
    expect(zonesMissing([a], [{ id: 1 }])).toEqual([]);
  });
});
