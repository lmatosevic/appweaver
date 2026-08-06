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
  parseISO,
  subDays
} from 'date-fns';
import {
  AggregateSelect,
  AggregateValue,
  PeriodIncrementFn,
  setValue
} from '@appweaver/common';

/** A single aggregation period, labeled with the median date of its range. */
export interface AggregationRange {
  from: Date;
  to: Date;
  median: Date;
}

/** The resolved aggregation date range together with its periods. */
export interface AggregationPeriods {
  fromDate: Date;
  toDate: Date;
  ranges: AggregationRange[];
}

/**
 * Resolves an aggregation date range from its ISO string bounds and splits it into equally sized periods.
 *
 * @param {string} [from] - The ISO date string of the range start. Defaults to seven days before the range end.
 * @param {string} [to] - The ISO date string of the range end. Defaults to the current date and time.
 * @param {number} [step] - The size of a single period in units of the automatically selected time unit. If not
 * provided, one unit is used and the unit is derived from the range length.
 * @param {boolean} [safeIncrement=true] - Whether the period increments use the derived time unit and stay consistent
 * across daylight saving time changes. When false, the step is interpreted in seconds.
 * @return {AggregationPeriods} The resolved range bounds and one range per period, each labeled with its median date.
 */
export function buildAggregationPeriods(
  from?: string,
  to?: string,
  step?: number,
  safeIncrement: boolean = true
): AggregationPeriods {
  const toDate = parseISO(to ?? new Date().toISOString());
  const fromDate = from ? parseISO(from) : subDays(toDate, 7);

  const iterator = makeAggregationIterator(
    fromDate,
    toDate,
    step,
    safeIncrement
  );

  const ranges: AggregationRange[] = [];

  let currentDate = parseISO(fromDate.toISOString());
  while (currentDate < toDate) {
    const date = currentDate;
    const median = iterator.addPeriod(date, (iterator.step - 1) / 2);
    currentDate = iterator.addPeriod(currentDate, iterator.step);
    ranges.push({ from: date, to: currentDate, median });
  }

  return { fromDate, toDate, ranges };
}

/**
 * Converts between the service aggregation selection format and the Prisma aggregation format by swapping the field
 * and operator nesting. With `isOutput` disabled, a `{ field: { count: true } }` selection becomes the
 * `{ _count: { field: true } }` Prisma input, and with it enabled a `{ _count: { field: 1 } }` Prisma result becomes
 * the `{ count: { field: 1 } }` response value.
 *
 * @param {Object} select - The values to convert, keyed by field name with the operators nested inside when mapping an
 * input selection, or keyed by the prefixed Prisma operator name with the fields nested inside when mapping an output
 * result.
 * @param {boolean} [isOutput=false] - Whether the values are a Prisma aggregation result that is mapped back to the
 * response format. When false, an input selection is mapped to the Prisma aggregation arguments.
 * @return {AggregateValue<Object>} The aggregation values with the field and operator nesting swapped, with the
 * operator names prefixed with `_` for an input and unprefixed for an output.
 */
export function mapAggregationValues<T>(
  select: AggregateSelect<T> | Record<string, Record<string, number>>,
  isOutput: boolean = false
): AggregateValue<T> {
  const aggregationMap = {};

  for (const field in select) {
    const operators = select[field];

    for (const operator in operators) {
      const value = operators[operator];
      const path = isOutput
        ? `${operator}.${field.substring(1)}`
        : `_${operator}.${field}`;

      setValue(aggregationMap, path, value);
    }
  }

  return aggregationMap;
}

/**
 * Builds the period iterator used to split an aggregation date range into equally sized periods. When no step is
 * provided, a step of one is used with the time unit derived from the range length, and the returned increment
 * function compensates for daylight saving time offset changes so every period keeps the time zone offset of its
 * start date.
 *
 * @param {Date} fromDate - The start of the aggregated date range.
 * @param {Date} toDate - The end of the aggregated date range.
 * @param {number} [step] - The size of a single period in units of the selected time unit. If not provided, a step of
 * one is used with the time unit derived from the range length (seconds up to a minute, minutes up to an hour, hours
 * up to a day, days up to a month, months up to a year, and years beyond that).
 * @param {boolean} [safeIncrement=true] - Whether the increments use the derived time unit. When false, the step is
 * interpreted in seconds.
 * @return {{addPeriod: PeriodIncrementFn, step: number}} The iterator holding the resolved step amount and the
 * `addPeriod` function that adds a number of periods to a date while preserving the time zone offset of that date.
 */
function makeAggregationIterator(
  fromDate: Date,
  toDate: Date,
  step?: number,
  safeIncrement: boolean = true
): { addPeriod: PeriodIncrementFn; step: number } {
  let stepAmount = step;
  let incrementFn: PeriodIncrementFn = addSeconds;

  if (!stepAmount) {
    const diffInSeconds = differenceInSeconds(toDate, fromDate);
    const diffInMonths = differenceInMonths(toDate, fromDate);
    const diffInYears = differenceInYears(toDate, fromDate);

    stepAmount = 1;

    // 1-second step if the difference is less than or equal to 1 minute
    if (diffInSeconds <= 60) {
      incrementFn = addSeconds;
    }
    // 1-minute step if the difference is less than or equal to 1 hour
    else if (diffInSeconds <= 3600) {
      incrementFn = addMinutes;
    }
    // 1-hour step if the difference is less than or equal to 1 day
    else if (diffInSeconds <= 86400) {
      incrementFn = addHours;
    }
    // 1-day step if the difference is less than or equal to 1 month
    else if (diffInMonths <= 1) {
      incrementFn = addDays;
    }
    // 1-month step if the difference is less than or equal to 1 year
    else if (diffInYears <= 1) {
      incrementFn = addMonths;
    }
    // 1-year step if the difference is equal to 1 year or more
    else {
      incrementFn = addYears;
    }
  }

  // A higher-order function that adjusts date increments to account for
  // changes in daylight saving time (DST). When incrementing dates in time
  // zones that observe DST, this function ensures that the resulting date
  // remains consistent with the original date's time zone offset.
  const dstAgnosticFn = (fn: PeriodIncrementFn) => {
    return (date: Date, amount: number): Date => {
      const endDate = fn(date, amount);
      return addMinutes(
        endDate,
        date.getTimezoneOffset() - endDate.getTimezoneOffset()
      );
    };
  };

  return {
    addPeriod: dstAgnosticFn(safeIncrement ? incrementFn : addSeconds),
    step: stepAmount
  };
}
