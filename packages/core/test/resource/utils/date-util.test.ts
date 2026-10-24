import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addSeconds,
  addYears,
  differenceInMonths,
  differenceInSeconds,
  differenceInYears,
  parseIsoDate
} from '../../../resource/utils/date-util';

const local = (...args: [number, number, number, number?, number?, number?]) =>
  new Date(args[0], args[1], args[2], args[3] ?? 0, args[4] ?? 0, args[5] ?? 0);

describe('parseIsoDate', () => {
  test('reads a date without a time as the local midnight', () => {
    expect(parseIsoDate('2024-03-05')).toEqual(local(2024, 2, 5));
  });

  test('reads a date with an offset as that instant', () => {
    expect(parseIsoDate('2024-03-05T10:20:30.000Z').toISOString()).toBe(
      '2024-03-05T10:20:30.000Z'
    );
  });

  test('returns an invalid date for a string that is not a date', () => {
    expect(parseIsoDate('not a date').getTime()).toBeNaN();
  });
});

describe('addSeconds, addMinutes and addHours', () => {
  const date = new Date('2024-01-01T00:00:00Z');

  test('add exact durations, fractions included', () => {
    expect(addSeconds(date, 1.5).toISOString()).toBe(
      '2024-01-01T00:00:01.500Z'
    );
    expect(addMinutes(date, 90).toISOString()).toBe('2024-01-01T01:30:00.000Z');
    expect(addHours(date, -2).toISOString()).toBe('2023-12-31T22:00:00.000Z');
  });
});

describe('addDays', () => {
  test('adds whole local days', () => {
    expect(addDays(local(2024, 1, 28), 2)).toEqual(local(2024, 2, 1));
    expect(addDays(local(2024, 0, 1), -7)).toEqual(local(2023, 11, 25));
  });

  test('returns a copy for zero days', () => {
    const date = local(2024, 0, 1);
    const result = addDays(date, 0);
    expect(result).toEqual(date);
    expect(result).not.toBe(date);
  });
});

describe('addMonths and addYears', () => {
  test('clamp the day to the last day of a shorter month', () => {
    expect(addMonths(local(2024, 0, 31), 1)).toEqual(local(2024, 1, 29));
    expect(addMonths(local(2023, 0, 31), 1)).toEqual(local(2023, 1, 28));
    expect(addYears(local(2024, 1, 29), 1)).toEqual(local(2025, 1, 28));
  });

  test('keep the day when the month has it', () => {
    expect(addMonths(local(2024, 0, 15), 13)).toEqual(local(2025, 1, 15));
    expect(addMonths(local(2024, 4, 15), 0)).toEqual(local(2024, 4, 15));
  });
});

describe('differenceInSeconds', () => {
  test('truncates toward zero', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    expect(differenceInSeconds(addSeconds(date, 1.9), date)).toBe(1);
    expect(differenceInSeconds(date, addSeconds(date, 1.9))).toBe(-1);
  });
});

describe('differenceInMonths', () => {
  test('counts the full months only', () => {
    expect(differenceInMonths(local(2024, 2, 14), local(2024, 0, 15))).toBe(1);
    expect(differenceInMonths(local(2024, 2, 15), local(2024, 0, 15))).toBe(2);
    expect(differenceInMonths(local(2024, 0, 15), local(2024, 2, 15))).toBe(-2);
    expect(differenceInMonths(local(2024, 0, 20), local(2024, 0, 1))).toBe(0);
  });

  test('counts a month ending on the last day of a shorter month', () => {
    expect(differenceInMonths(local(2024, 1, 29), local(2024, 0, 31))).toBe(1);
  });
});

describe('differenceInYears', () => {
  test('counts the full years only', () => {
    expect(differenceInYears(local(2025, 0, 14), local(2024, 0, 15))).toBe(0);
    expect(differenceInYears(local(2026, 0, 15), local(2024, 0, 15))).toBe(2);
    expect(differenceInYears(local(2024, 0, 15), local(2026, 0, 15))).toBe(-2);
  });
});
