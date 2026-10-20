const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;

/** A date-only ISO string, which reads as the local midnight instead of the UTC one of the `Date` constructor. */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses an ISO 8601 date string. A date without a time is the local midnight of that day, a date and time without an
 * offset is local, and one with an offset is that exact instant.
 *
 * @param {string} value - The ISO date string.
 * @return {Date} The parsed date, invalid when the string is not a date.
 */
export function parseIsoDate(value: string): Date {
  const dateOnly = DATE_ONLY_PATTERN.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(value);
}

export function addSeconds(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_IN_SECOND);
}

export function addMinutes(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_IN_MINUTE);
}

export function addHours(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_IN_HOUR);
}

/** Adds whole local days, keeping the time of day across daylight saving time changes. */
export function addDays(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  if (amount) {
    result.setDate(result.getDate() + amount);
  }
  return result;
}

/** Adds whole local months, clamping the day to the last day of a shorter month (January 31 plus one is February 28). */
export function addMonths(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  if (!amount) {
    return result;
  }
  const dayOfMonth = result.getDate();
  const endOfDesiredMonth = new Date(date.getTime());
  endOfDesiredMonth.setMonth(result.getMonth() + amount + 1, 0);
  if (dayOfMonth >= endOfDesiredMonth.getDate()) {
    return endOfDesiredMonth;
  }
  result.setFullYear(
    endOfDesiredMonth.getFullYear(),
    endOfDesiredMonth.getMonth(),
    dayOfMonth
  );
  return result;
}

export function addYears(date: Date, amount: number): Date {
  return addMonths(date, amount * 12);
}

/** Returns the whole seconds between two dates, truncated toward zero. */
export function differenceInSeconds(
  laterDate: Date,
  earlierDate: Date
): number {
  return Math.trunc(
    (laterDate.getTime() - earlierDate.getTime()) / MS_IN_SECOND
  );
}

/** Returns the full local months between two dates, negative when the first date is the earlier one. */
export function differenceInMonths(laterDate: Date, earlierDate: Date): number {
  const sign = compare(laterDate, earlierDate);
  const difference = Math.abs(
    (laterDate.getFullYear() - earlierDate.getFullYear()) * 12 +
      laterDate.getMonth() -
      earlierDate.getMonth()
  );
  if (difference < 1) {
    return 0;
  }

  const working = new Date(laterDate.getTime());
  if (working.getMonth() === 1 && working.getDate() > 27) {
    working.setDate(30);
  }
  working.setMonth(working.getMonth() - sign * difference);

  // The last month counts only once its day is reached, unless the later date ends a month
  let isLastMonthNotFull = compare(working, earlierDate) === -sign;
  if (isLastDayOfMonth(laterDate) && difference === 1 && sign === 1) {
    isLastMonthNotFull = false;
  }

  return sign * (difference - Number(isLastMonthNotFull)) || 0;
}

/** Returns the full local years between two dates, negative when the first date is the earlier one. */
export function differenceInYears(laterDate: Date, earlierDate: Date): number {
  const sign = compare(laterDate, earlierDate);
  const difference = Math.abs(
    laterDate.getFullYear() - earlierDate.getFullYear()
  );

  // Compares the dates within the same leap year to tell whether the last year is full
  const later = new Date(laterDate.getTime());
  const earlier = new Date(earlierDate.getTime());
  later.setFullYear(1584);
  earlier.setFullYear(1584);
  const isLastYearNotFull = compare(later, earlier) === -sign;

  return sign * (difference - Number(isLastYearNotFull)) || 0;
}

function compare(left: Date, right: Date): number {
  return Math.sign(left.getTime() - right.getTime());
}

function isLastDayOfMonth(date: Date): boolean {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + 1);
  return next.getMonth() !== date.getMonth();
}
