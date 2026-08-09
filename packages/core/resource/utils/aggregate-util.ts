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
  AuditFields,
  isPlainObject,
  PeriodIncrementFn,
  ResourceClient,
  ResourceModel,
  ScalarField,
  setValue
} from '@appweaver/common';
import { injectModel } from '../../context';
import { HttpError } from '../../errors';

/** The kind of value an aggregatable field holds. */
export type AggregateFieldType = 'numeric' | 'date';

/**
 * The operations a selection is resolved by: the arguments of a single database aggregation, and the fields read off
 * the earliest and the latest record of the aggregated range.
 */
export type AggregationOperations = {
  /** The Prisma aggregation arguments, keyed by the prefixed operator name */
  aggregate: Record<string, any>;
  /** The fields whose value is read off the earliest record of the range */
  first: string[];
  /** The fields whose value is read off the latest record of the range */
  last: string[];
};

/** The scalar types holding a numeric value, which every operator applies to. */
const NUMERIC_TYPES: ScalarField['type'][] = ['int', 'bigInt', 'float'];

/** The scalar types holding a date value, which cannot be summed or averaged. */
const DATE_TYPES: ScalarField['type'][] = ['dateTime'];

/** The operators resolved by reading a boundary record of the range instead of aggregating it. */
const BOUNDARY_OPERATORS = ['first', 'last'];

/** The Prisma selection counting every record of a range, regardless of the fields it holds. */
const COUNT_ALL_FIELD = '_all';

/** The aggregation operators applicable to a field, per kind of value. */
const OPERATORS: Record<AggregateFieldType, string[]> = {
  numeric: ['count', 'sum', 'avg', 'min', 'max', ...BOUNDARY_OPERATORS],
  date: ['count', 'min', 'max', ...BOUNDARY_OPERATORS]
};

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
 * Maps an aggregation selection to the operations that resolve it, splitting the operators the database aggregates in
 * a single query from the `first` and `last` operators, which read the boundary records of the range instead. Every
 * field is validated against the model it is aggregated on, and every operator against the kind of value its field
 * holds, since only the numeric fields can be summed and averaged.
 *
 * @param {AggregateSelect<Object>} select - The operations to perform per field, with the operators of a field nested
 * inside it. The operators set to false are left out.
 * @param {string} resourceName - The name of the model the selection is aggregated on.
 * @return {AggregationOperations} The Prisma aggregation arguments, keyed by the prefixed operator name with the
 * selected fields nested inside, together with the fields read off the earliest and the latest record of the range.
 * The arguments always count the records of the range when a boundary field was selected, so the boundary queries can
 * be skipped for the empty ranges.
 * @throws {HttpError} 400 if the selection is not an object, selects no operation at all, names a field the model
 * cannot aggregate, or applies an operator the kind of value of its field does not support.
 */
export function mapAggregationSelect<T>(
  select: AggregateSelect<T>,
  resourceName: string
): AggregationOperations {
  if (!isPlainObject(select)) {
    throw new HttpError(
      `${resourceName} aggregate select must be an object of fields to aggregate`,
      400
    );
  }

  const model = injectModel(resourceName);
  const fieldTypes = new Map<string, AggregateFieldType>(
    aggregateFields(model)
  );

  const operations: AggregationOperations = {
    aggregate: {},
    first: [],
    last: []
  };

  for (const [field, operators] of Object.entries(select)) {
    const fieldType = fieldTypes.get(field);
    if (!fieldType) {
      throw new HttpError(
        `Cannot aggregate the '${field}' field, it is not a numeric or date field of the ${model.name} model`,
        400
      );
    }

    if (!isPlainObject(operators)) {
      throw new HttpError(
        `Cannot aggregate the '${field}' field, its value must be an object of aggregation operators`,
        400
      );
    }

    for (const [operator, enabled] of Object.entries(operators)) {
      if (!OPERATORS[fieldType].includes(operator)) {
        throw new HttpError(
          `Cannot apply the '${operator}' operator to the ${fieldType} field '${field}', ` +
            `expected one of: ${OPERATORS[fieldType].join(', ')}`,
          400
        );
      }

      if (!enabled) {
        continue;
      }

      if (isBoundaryOperator(operator)) {
        operations[operator].push(field);
      } else {
        setValue(operations.aggregate, `_${operator}.${field}`, true);
      }
    }
  }

  const hasBoundary = operations.first.length + operations.last.length > 0;

  if (Object.keys(operations.aggregate).length === 0 && !hasBoundary) {
    throw new HttpError(
      `${resourceName} aggregate requires at least one field with a selected aggregation operator`,
      400
    );
  }

  // The record count of a range decides whether its boundary records have to be
  // read at all, and it is also the only aggregation left to perform when the
  // selection holds nothing but the boundary operators
  if (hasBoundary) {
    setValue(operations.aggregate, `_count.${COUNT_ALL_FIELD}`, true);
  }

  return operations;
}

/**
 * Maps a Prisma aggregation result back to the response format by swapping the operator and field nesting, so a
 * `{ _count: { views: 3 } }` result becomes the `{ views: { count: 3 } }` response value. The boundary record values
 * are mapped the same way when they are merged into the result under their own `_first` and `_last` keys.
 *
 * @param {Object} result - The Prisma aggregation result, keyed by the prefixed operator name with the aggregated
 * fields nested inside.
 * @return {AggregateValue<Object>} The aggregated values keyed by field name, with the operator results nested inside.
 * The record count of the range is left out, since it counts no field of its own.
 */
export function mapAggregationResult<T>(
  result: Record<string, Record<string, any>>
): AggregateValue<T> {
  const aggregationMap = {};

  for (const operator in result) {
    const fields = result[operator];

    for (const field in fields) {
      if (field === COUNT_ALL_FIELD) {
        continue;
      }

      setValue(
        aggregationMap,
        `${field}.${operator.substring(1)}`,
        fields[field]
      );
    }
  }

  return aggregationMap;
}

/**
 * Reads the `first` and `last` values of an aggregated range off its boundary records. The earliest and the latest
 * record of the range are looked up by the same date field the range is sliced by, with the record id breaking the
 * ties, and only the selected fields are read off them. The values of an empty range are resolved to null without
 * querying for them, so a range the aggregation already counted as empty costs nothing.
 *
 * @param {ResourceClient} client - The model client the boundary records are read with, which is the transaction
 * client of the aggregation.
 * @param {Object} where - The database query of the aggregated range, applied unchanged to the boundary lookups.
 * @param {string} dateField - The date field the range is sliced by, which the boundary records are ordered by.
 * @param {AggregationOperations} operations - The operations holding the fields to read off each boundary record.
 * @param {number} [recordCount] - The number of records in the range, used to skip the lookups of an empty range. When
 * omitted, the lookups are always performed.
 * @return {Promise<Object>} The boundary values keyed by the prefixed operator name (`_first` and `_last`) with the
 * read fields nested inside, ready to be merged into the aggregation result of the range. Empty when no boundary field
 * was selected.
 */
export async function readAggregationBoundaries(
  client: ResourceClient,
  where: any,
  dateField: string,
  operations: AggregationOperations,
  recordCount?: number
): Promise<Record<string, any>> {
  const boundaries: Record<string, any> = {};

  const readBoundary = async (
    operator: 'first' | 'last',
    direction: 'asc' | 'desc'
  ) => {
    const fields = operations[operator];
    if (fields.length === 0) {
      return;
    }

    // An empty range holds no record to read the values off, and its fields are
    // resolved to null the same way the database aggregations resolve theirs
    const record =
      recordCount === 0
        ? undefined
        : await client.findFirst({
            where,
            // The id breaks the ties of the records sharing the same date, so
            // the boundary of a range stays the same across identical requests
            orderBy: [{ [dateField]: direction }, { id: direction }],
            select: Object.fromEntries(fields.map((field) => [field, true]))
          });

    boundaries[`_${operator}`] = Object.fromEntries(
      fields.map((field) => [field, record?.[field] ?? null])
    );
  };

  await Promise.all([
    readBoundary('first', 'asc'),
    readBoundary('last', 'desc')
  ]);

  return boundaries;
}

/**
 * Reads the record count a Prisma aggregation result holds for its range, as counted by the `_all` selection that
 * {@link mapAggregationSelect} adds whenever a boundary field is selected.
 *
 * @param {Object} result - The Prisma aggregation result to read the count off.
 * @return {number|undefined} The number of records in the range, or undefined when the result does not count them.
 */
export function aggregationRecordCount(
  result: Record<string, any>
): number | undefined {
  return isPlainObject(result?._count)
    ? result._count[COUNT_ALL_FIELD]
    : undefined;
}

/** Determines whether an operator reads a boundary record instead of aggregating the range. */
function isBoundaryOperator(operator: string): operator is 'first' | 'last' {
  return BOUNDARY_OPERATORS.includes(operator);
}

/**
 * Validates the date field the aggregated range is applied on against the model it is aggregated on.
 *
 * @param {string} dateField - The name of the date field to validate.
 * @param {string} resourceName - The name of the model the range is applied on.
 * @return {string} The validated date field name.
 * @throws {HttpError} 400 if the model has no date field under that name.
 */
export function checkAggregationDateField(
  dateField: string,
  resourceName: string
): string {
  const model = injectModel(resourceName);

  const dateFields = aggregateFields(model)
    .filter(([, type]) => type === 'date')
    .map(([field]) => field);

  if (!dateFields.includes(dateField)) {
    throw new HttpError(
      `Cannot aggregate over the '${dateField}' field, it is not a date field of the ${model.name} model` +
        (dateFields.length > 0
          ? `, expected one of: ${dateFields.join(', ')}`
          : ''),
      400
    );
  }

  return dateField;
}

/**
 * Lists the aggregatable fields of a resource model together with the kind of value they hold. The id is aggregatable
 * when it is numeric, the audit fields follow the audit configuration of the model, and the scalars are aggregatable
 * when they hold a single numeric or date value and are not hidden. The virtual fields are never aggregatable, since
 * they have no column of their own.
 *
 * @param {ResourceModel} model - The resource model whose fields are listed.
 * @return {Array} The name and kind (`numeric` or `date`) of every aggregatable field, in the order the model declares
 * them.
 */
export function aggregateFields(
  model: ResourceModel
): [field: string, type: AggregateFieldType][] {
  const fields: [string, AggregateFieldType][] = [];

  if ((model.config.id?.type ?? 'int') !== 'string') {
    fields.push(['id', 'numeric']);
  }

  const auditFields: AuditFields = {
    updatedAt: true,
    createdAt: true,
    createdById: true,
    ...(model.config.audit ?? {})
  };
  for (const [fieldName, included] of Object.entries(auditFields)) {
    if (included) {
      fields.push([
        fieldName,
        fieldName === 'createdById' ? 'numeric' : 'date'
      ]);
    }
  }

  for (const [fieldName, scalar] of Object.entries(
    model.config.scalars ?? {}
  )) {
    if (scalar.hidden || scalar.array) {
      continue;
    }
    if (NUMERIC_TYPES.includes(scalar.type)) {
      fields.push([fieldName, 'numeric']);
    } else if (DATE_TYPES.includes(scalar.type)) {
      fields.push([fieldName, 'date']);
    }
  }

  return fields;
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
