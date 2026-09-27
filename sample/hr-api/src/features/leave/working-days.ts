/**
 * Counts the working days (Monday to Friday) between two dates, both included.
 * Only the calendar date of each is considered, in UTC.
 */
export function countWorkingDays(start: Date, end: Date): number {
  const from = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );
  const to = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate()
  );

  let days = 0;
  for (let day = from; day <= to; day += 86_400_000) {
    const weekDay = new Date(day).getUTCDay();
    if (weekDay !== 0 && weekDay !== 6) {
      days++;
    }
  }

  return days;
}

/**
 * The share of the yearly allowance an employee hired during the year is
 * entitled to, rounded to whole days.
 */
export function proratedAllowance(allowance: number, hireDate: Date): number {
  const year = hireDate.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);
  const remaining = (yearEnd - hireDate.getTime()) / (yearEnd - yearStart);

  return Math.round(allowance * Math.min(Math.max(remaining, 0), 1));
}
