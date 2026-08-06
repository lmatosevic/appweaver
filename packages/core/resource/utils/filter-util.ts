import {
  extractResourceName,
  extractSchemaProperties,
  isArray,
  isPlainObject
} from '@appweaver/common';
import { injectModel } from '../../context';

/**
 * Logical filter operators mapped to their database query connectives. Both
 * `_not` and `_nor` negate the conjunction of their conditions.
 */
const logicalOperators: Record<string, 'AND' | 'OR' | 'NOT'> = {
  _and: 'AND',
  _or: 'OR',
  _not: 'NOT',
  _nor: 'NOT'
};

/** List relation filter operators mapped to their database quantifiers. */
const relationOperators: Record<string, 'some' | 'every' | 'none'> = {
  _some: 'some',
  _every: 'every',
  _none: 'none'
};

/** Reads a boolean operator value, accepting the `'false'` string as false. */
const isTruthy = (value: any): boolean =>
  !(value === false || value === 'false');

/** Wraps a single operator value into a list. */
const asArray = (value: any): any[] => (isArray(value) ? value : [value]);

/**
 * Maps an SQL LIKE pattern to the matching string condition, based on the
 * placement of its `%` wildcards. A pattern without wildcards matches exactly.
 */
const likePattern = (pattern: any): Record<string, any> => {
  const value = String(pattern);
  const startsWildcard = value.startsWith('%');
  const endsWildcard = value.endsWith('%') && value.length > 1;
  const inner = value.slice(
    startsWildcard ? 1 : 0,
    endsWildcard ? -1 : undefined
  );

  if (startsWildcard && endsWildcard) {
    return { contains: inner };
  }
  if (endsWildcard) {
    return { startsWith: inner };
  }
  if (startsWildcard) {
    return { endsWith: inner };
  }
  return { equals: value };
};

/**
 * Field comparison operators mapped to their database query conditions.
 * Operators combined in the same object are merged into a single condition.
 */
const fieldOperators: Record<string, (value: any) => Record<string, any>> = {
  _eq: (value) => ({ equals: value }),
  _ne: (value) => ({ not: value }),
  _gt: (value) => ({ gt: value }),
  _gte: (value) => ({ gte: value }),
  _lt: (value) => ({ lt: value }),
  _lte: (value) => ({ lte: value }),
  _in: (value) => ({ in: asArray(value) }),
  _nin: (value) => ({ notIn: asArray(value) }),
  _between: (value) => ({ gte: value?.[0], lte: value?.[1] }),
  _like: (value) => likePattern(value),
  _ilike: (value) => ({ ...likePattern(value), mode: 'insensitive' }),
  _starts: (value) => ({ startsWith: value }),
  _ends: (value) => ({ endsWith: value }),
  _contains: (value) => ({ contains: value }),
  _exists: (value) => (isTruthy(value) ? { not: null } : { equals: null }),
  _has: (value) => ({ has: value }),
  _hasSome: (value) => ({ hasSome: asArray(value) }),
  _hasEvery: (value) => ({ hasEvery: asArray(value) }),
  _isEmpty: (value) => ({ isEmpty: isTruthy(value) })
};

/**
 * Maps a request filter to a Prisma `where` clause based on the schema of the
 * given resource model. The logical operators (`_and`, `_or`, `_not`, `_nor`)
 * combine their nested conditions with the matching connective, the field
 * operator objects (`_eq`, `_gt`, `_like`, `_exists`, ...) are translated to
 * their database conditions, and the list relation quantifiers (`_some`,
 * `_every`, `_none`) filter the related records. Plain values keep their
 * shorthand meaning: relation and file fields are matched by id (wrapped in a
 * `some` condition for the array relations), array fields use the `has` and
 * `hasSome` operators, an array value on a numeric or date field becomes an
 * inclusive `gte`/`lte` range, other array values become an `in` inclusion,
 * nested objects are mapped recursively against the related model, and null
 * values are passed through to match records without a value or a related
 * record. Values that match no known field are passed through with only their
 * operators translated, so the Prisma operators can still be used directly.
 *
 * @param {Object} filter The request filter object to map.
 * @param {string} resourceName The name of the model the filter is matched
 * against. It is set to the related model name when recursing into a nested
 * relation or file filter.
 * @returns {Object} The `where` clause with every recognized field mapped to its
 * database condition and the unrecognized values passed through unchanged.
 */
export function mapQueryFilter(filter: any, resourceName: string): any {
  const queryFilter = {};

  const resourceModel = injectModel(resourceName, false);
  const readModel = resourceModel?.readModel;
  const relationsModel = resourceModel?.relationsModel;
  const filesModel = resourceModel?.filesModel;

  for (const key in filter) {
    const value = filter[key];

    // Logical operators combine their conditions, given either as a filter
    // object whose entries become separate conditions or as a list of
    // filters, with the matching database connective
    if (logicalOperators[key]) {
      const operator = logicalOperators[key];
      const conditions = mapFilterConditions(value, (item) =>
        mapQueryFilter(item, resourceName)
      );
      queryFilter[operator] = [...(queryFilter[operator] ?? []), ...conditions];
      continue;
    }

    // List relation quantifiers filter the related records of the model the
    // current filter level is matched against
    if (relationOperators[key] && isPlainObject(value)) {
      queryFilter[relationOperators[key]] = mapQueryFilter(value, resourceName);
      continue;
    }

    const readSchema = extractSchemaProperties(readModel, key);
    const relationSchema = extractSchemaProperties(relationsModel, key);
    const fileSchema = extractSchemaProperties(filesModel, key);

    const isArrayType =
      readSchema?.type === 'array' ||
      relationSchema?.type === 'array' ||
      fileSchema?.type === 'array';

    const isArrayValue = isArray(value);

    // Null values are passed through untouched, matching records without a
    // value or, for relations, without a related record.
    if (value === null) {
      queryFilter[key] = null;
      continue;
    }

    // Recursively map nested objects and handle arrays of objects. Arrays of
    // plain values are mapped below as inclusion, range or relation filters.
    if (isPlainObject(value) || (isArrayValue && isPlainObject(value[0]))) {
      const relatedName = extractResourceName(relationSchema ?? fileSchema);
      if (relatedName) {
        queryFilter[key] = isArrayValue
          ? value.map((item: any) => mapQueryFilter(item, relatedName))
          : mapRelationFilter(value, relatedName, isArrayType);
      } else {
        // Objects that match no relation have their field operators
        // translated and everything else passed through unchanged
        queryFilter[key] = mapFieldFilter(value);
      }
    }
    // Map ID values for both single and array types of relationships
    else if (relationSchema || fileSchema) {
      const queryId = { id: isArrayValue ? { in: value } : value };
      queryFilter[key] = isArrayType ? { some: queryId } : queryId;
    }
    // Map fields without relationships, supporting array types
    else if (readSchema) {
      if (isArrayType) {
        queryFilter[key] = isArrayValue ? { hasSome: value } : { has: value };
      } else if (isArrayValue) {
        // For date and numeric types, apply range filtering with inclusive
        // intervals
        if (
          value.length > 0 &&
          value.length <= 2 &&
          (['number', 'integer'].includes(readSchema.type) ||
            ['date', 'date-time'].includes(readSchema.format))
        ) {
          queryFilter[key] = {
            gte: value[0],
            lte: value[1]
          };
        }
        // Map array values for inclusion checks
        else {
          queryFilter[key] = { in: value };
        }
      }
    }

    // If no query filter was defined, assign the original value
    if (queryFilter[key] === undefined) {
      queryFilter[key] = value;
    }
  }

  return queryFilter;
}

/**
 * Normalizes the value of a logical filter operator to the list of its
 * mapped conditions. A list of filters maps every item separately, while a
 * single filter object maps every entry into its own condition, so the
 * logical connective is applied per field.
 *
 * @param {Object|Object[]} value The logical operator value to normalize.
 * @param {Function} map The function mapping a single filter condition.
 * @returns {Object[]} The list of mapped filter conditions.
 */
function mapFilterConditions(value: any, map: (item: any) => any): any[] {
  if (isArray(value)) {
    return value.map(map);
  }
  if (isPlainObject(value)) {
    return Object.entries(value).map(([key, item]) => map({ [key]: item }));
  }
  return [value];
}

/**
 * Maps the filter of a relation or file field to its database condition
 * against the related model. The `_exists` operator is resolved based on the
 * relation cardinality: a list relation wraps the remaining conditions in a
 * `some` (or `none`) quantifier, while a single relation maps to an `is` or
 * `isNot` null check, wrapping the remaining conditions in an `is` filter.
 *
 * @param {Object} filter The relation filter object to map.
 * @param {string} resourceName The name of the related model the filter is
 * matched against.
 * @param {boolean} isArrayType Whether the relation is a list (to-many)
 * relation.
 * @returns {Object} The database condition of the relation field.
 */
function mapRelationFilter(
  filter: any,
  resourceName: string,
  isArrayType: boolean
): any {
  const { _exists, ...conditions } = filter;
  const mapped = mapQueryFilter(conditions, resourceName);

  if (_exists === undefined) {
    return mapped;
  }

  const exists = isTruthy(_exists);
  const hasConditions = Object.keys(conditions).length > 0;

  if (isArrayType) {
    return exists ? { some: mapped } : { none: mapped };
  }
  if (!exists) {
    return { is: null };
  }
  return hasConditions ? { is: mapped } : { isNot: null };
}

/**
 * Maps a field condition object to its database condition by translating the
 * filter operators anywhere in its structure. The field operators of one
 * object are merged into a single condition, a `_not` holding an operator
 * object or a plain value negates it, the logical operators combine their
 * nested conditions, and everything else is passed through unchanged, so
 * native database conditions keep working.
 *
 * @param {*} value The field condition value to map.
 * @returns {*} The database condition with every filter operator translated.
 */
function mapFieldFilter(value: any): any {
  if (isArray(value)) {
    return value.map((item) => mapFieldFilter(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const condition = {};

  for (const [key, item] of Object.entries(value)) {
    // A `_not` negates its operator object or plain value directly, while an
    // object of field conditions is combined as a logical NOT below
    if (key === '_not' && (!isPlainObject(item) || hasFieldOperators(item))) {
      condition['not'] = mapFieldFilter(item);
      continue;
    }

    if (logicalOperators[key]) {
      const operator = logicalOperators[key];
      const conditions = mapFilterConditions(item, (entry) =>
        mapFieldFilter(entry)
      );
      condition[operator] = [...(condition[operator] ?? []), ...conditions];
      continue;
    }

    if (relationOperators[key]) {
      condition[relationOperators[key]] = mapFieldFilter(item);
      continue;
    }

    if (fieldOperators[key]) {
      Object.assign(condition, fieldOperators[key](item));
      continue;
    }

    condition[key] = mapFieldFilter(item);
  }

  return condition;
}

/**
 * Checks whether the given value is an object holding at least one field
 * comparison operator (i.e. `_eq`, `_gt`, `_like`, ...).
 *
 * @param {*} value The value to check.
 * @returns {boolean} True if the value contains a field operator.
 */
function hasFieldOperators(value: any): boolean {
  return (
    isPlainObject(value) &&
    Object.keys(value).some((key) => fieldOperators[key] || key === '_not')
  );
}
