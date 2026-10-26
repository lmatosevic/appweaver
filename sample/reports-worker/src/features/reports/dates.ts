const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** The UTC date of a moment, i.e. `2026-10-26`. */
export function toDate(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/** The UTC day of a date, from its midnight to the next one. */
export function dayRange(date: string): { from: Date; to: Date } {
  const from = parseDate(date);
  return { from, to: addDays(from, 1) };
}

/** The dates from the first to the last one, both included. */
export function datesBetween(first: string, last: string): string[] {
  const dates: string[] = [];
  for (
    let day = parseDate(first);
    day <= parseDate(last);
    day = addDays(day, 1)
  ) {
    dates.push(toDate(day));
  }
  return dates;
}

/** The moment the given number of days before (or after, when negative) another one. */
export function daysBefore(moment: Date, days: number): Date {
  return addDays(moment, -days);
}

/**
 * Parses a date of the `YYYY-MM-DD` format at midnight UTC.
 *
 * @throws {Error} When the date is not in the format or does not exist.
 */
export function parseDate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !datePattern.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    toDate(parsed) !== date
  ) {
    throw new Error(`Invalid date ${date}, expected YYYY-MM-DD`);
  }
  return parsed;
}

function addDays(moment: Date, days: number): Date {
  return new Date(moment.getTime() + days * 86_400_000);
}
