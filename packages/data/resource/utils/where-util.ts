import { isArray } from '@appweaver/common';
import { mapQueryFilter } from './filter-util';

const OPERATORS = new Set([
  'equals',
  'not',
  'in',
  'notIn',
  'lt',
  'lte',
  'gt',
  'gte',
  'contains',
  'startsWith',
  'endsWith',
  'mode'
]);

/**
 * Matches a record against a `where` filter of Prisma without the database, i.e. the read restrictions of a policy
 * against the resource of an event. The filter may combine `AND`, `OR` and `NOT` with the scalar conditions (`equals`,
 * `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith`, with `mode: 'insensitive'`).
 *
 * @param {Object} record - The record to match, its dates as `Date` objects or ISO strings.
 * @param {Object} where - The filter, in the native Prisma filter syntax.
 * @return {boolean | undefined} Whether the record matches, or `undefined` for a filter it cannot evaluate, i.e. a
 * relation filter or a field the record lacks, which only the database can match.
 */
export function matchesWhere(
  record: Record<string, any>,
  where: Record<string, any> | null | undefined
): boolean | undefined {
  if (!where) {
    return true;
  }

  let result: boolean | undefined = true;

  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) {
      continue;
    }

    let matched: boolean | undefined;

    if (key === 'AND') {
      matched = every(
        (isArray(condition) ? condition : [condition]).map((c) =>
          matchesWhere(record, c)
        )
      );
    } else if (key === 'OR') {
      matched = some(
        (condition as Record<string, any>[]).map((c) => matchesWhere(record, c))
      );
    } else if (key === 'NOT') {
      matched = negate(
        some(
          (isArray(condition) ? condition : [condition]).map((c) =>
            matchesWhere(record, c)
          )
        )
      );
    } else if (!(key in record)) {
      return undefined;
    } else {
      matched = matchesField(record[key], condition);
    }

    result = every([result, matched]);
    if (result === false) {
      return false;
    }
  }

  return result;
}

/**
 * Maps a query filter of the resource routes, i.e. `{ status: 'open', total: { _gt: 100 } }`, to the `where` filter of
 * Prisma {@link matchesWhere} matches, i.e. the filter of a realtime subscription.
 *
 * @param {Object} filter - The query filter.
 * @param {string} modelName - The name of the model the filter is matched against.
 * @return {Object} The `where` filter.
 */
export function queryFilterWhere(
  filter: Record<string, unknown>,
  modelName: string
): Record<string, any> {
  return mapQueryFilter(filter, modelName);
}

function matchesField(value: unknown, condition: unknown): boolean | undefined {
  if (!isConditionObject(condition)) {
    return isScalar(value) ? equals(value, condition) : undefined;
  }

  // A nested filter of a relation or a JSON field, matched by the database
  if (!Object.keys(condition).every((key) => OPERATORS.has(key))) {
    return undefined;
  }
  if (!isScalar(value)) {
    return undefined;
  }

  const insensitive = condition.mode === 'insensitive';
  const results: (boolean | undefined)[] = [];

  for (const [operator, operand] of Object.entries(condition)) {
    if (operand === undefined || operator === 'mode') {
      continue;
    }
    results.push(compare(value, operator, operand, insensitive));
  }

  return every(results);
}

function compare(
  value: unknown,
  operator: string,
  operand: any,
  insensitive: boolean
): boolean | undefined {
  switch (operator) {
    case 'equals':
      return equals(value, operand, insensitive);
    case 'not':
      return isConditionObject(operand)
        ? negate(matchesField(value, operand))
        : !equals(value, operand, insensitive);
    case 'in':
      return isArray(operand)
        ? operand.some((o) => equals(value, o, insensitive))
        : undefined;
    case 'notIn':
      return isArray(operand)
        ? !operand.some((o) => equals(value, o, insensitive))
        : undefined;
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      return order(value, operator, operand);
    default:
      return matchesText(value, operator, operand, insensitive);
  }
}

function matchesText(
  value: unknown,
  operator: string,
  operand: unknown,
  insensitive: boolean
): boolean | undefined {
  if (typeof value !== 'string' || typeof operand !== 'string') {
    return value === null ? false : undefined;
  }

  const text = insensitive ? value.toLowerCase() : value;
  const search = insensitive ? operand.toLowerCase() : operand;

  if (operator === 'contains') {
    return text.includes(search);
  }
  return operator === 'startsWith'
    ? text.startsWith(search)
    : text.endsWith(search);
}

function order(
  value: unknown,
  operator: 'lt' | 'lte' | 'gt' | 'gte',
  operand: unknown
): boolean | undefined {
  if (value === null || operand === null) {
    return false;
  }

  const left = comparable(value, operand);
  const right = comparable(operand, value);
  if (left === undefined || right === undefined) {
    return undefined;
  }

  switch (operator) {
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    case 'gt':
      return left > right;
    default:
      return left >= right;
  }
}

function equals(
  value: unknown,
  operand: unknown,
  insensitive: boolean = false
): boolean {
  if (value === null || operand === null) {
    return value === operand;
  }
  if (insensitive && typeof value === 'string' && typeof operand === 'string') {
    return value.toLowerCase() === operand.toLowerCase();
  }

  const left = comparable(value, operand);
  const right = comparable(operand, value);
  return left !== undefined && left === right;
}

/** The value to compare, a date as its time when either side is a date, and a big integer as a number. */
function comparable(
  value: unknown,
  other: unknown
): string | number | boolean | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (other instanceof Date && typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? undefined : time;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return undefined;
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    value instanceof Date ||
    ['string', 'number', 'boolean', 'bigint'].includes(typeof value)
  );
}

function isConditionObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isArray(value) &&
    !(value instanceof Date)
  );
}

/** `false` when any is false, `undefined` when any is unknown, `true` otherwise. */
function every(results: (boolean | undefined)[]): boolean | undefined {
  if (results.includes(false)) {
    return false;
  }
  return results.includes(undefined) ? undefined : true;
}

/** `true` when any is true, `undefined` when any is unknown, `false` otherwise. */
function some(results: (boolean | undefined)[]): boolean | undefined {
  if (results.includes(true)) {
    return true;
  }
  return results.includes(undefined) ? undefined : false;
}

function negate(result: boolean | undefined): boolean | undefined {
  return result === undefined ? undefined : !result;
}
