import {
  ActionType,
  AuditFields,
  capitalize,
  countFieldName,
  FileField,
  isCountField,
  isPlainObject,
  isRelationArray,
  isString,
  QuerySort,
  RelationField,
  ResourceModel,
  setValue
} from '@appweaver/common';
import { injectModel } from '../../context';
import { HttpError } from '../../errors';
import { mapRelationInclusions } from './relation-util';

/** A single sort entry, holding a dot notation field path and its direction. */
type SortEntry = [path: string, direction: 'asc' | 'desc'];

/** The audit fields every model declares unless it opts out of them. */
const defaultAuditFields: AuditFields = {
  updatedAt: true,
  createdAt: true,
  createdById: true
};

/**
 * Maps a sort input to the ordered list of Prisma `orderBy` entries. The input is accepted either as a comma-separated
 * field list, where a field prefixed with `-` is sorted in descending order, or as a (possibly nested) object of `asc`
 * and `desc` field directions. Both forms support the same field paths: a scalar field of the
 * model, a field of a to-one relation (`author.createdAt` or `{ author: { createdAt: 'desc' } }`), and the related
 * record count of a to-many relation, given either as its count field (`tagsCount`) or as the relation itself
 * (`tags`). The default `createdAt` sort is dropped when the model does not audit that field.
 *
 * @param {QuerySort} sort - The sort input to map, as a comma-separated field list or a sort object.
 * @param {string} resourceName - The name of the model the sort is applied on.
 * @param {ActionType} [action] - The action the sort is applied on, deciding which relations are included in the
 * response and are therefore available to sort by. Defaults to the query action.
 * @return {Object[]} One `orderBy` entry per field, in the order the fields were listed, each holding the single path
 * of that field mapped to `asc` or `desc`. Two fields of the same relation get an entry each, since a database order
 * entry accepts a single field path.
 * @throws {HttpError} 400 if a field does not exist on its model, cannot be sorted by, is given an unknown sort
 * direction, or targets a relation that the action does not include in its response.
 */
export function mapSortValues(
  sort: QuerySort,
  resourceName: string,
  action: ActionType = 'query'
): any[] {
  const inclusions = mapRelationInclusions(resourceName, action);

  const orderBy: any[] = [];
  const mappedPaths = new Set<string>();

  for (const [path, direction] of sortEntries(sort)) {
    const mappedPath = mapSortPath(resourceName, path, inclusions);

    // Every field gets an entry of its own, since a database order entry holds
    // a single field path, even when several of them share a relation. A field
    // listed twice is already ordered by its first entry, so it is dropped
    if (!mappedPath || mappedPaths.has(mappedPath)) {
      continue;
    }

    mappedPaths.add(mappedPath);
    orderBy.push(setValue({}, mappedPath, direction));
  }

  return orderBy;
}

/**
 * Flattens a sort input into the list of its field paths and directions, keeping the order the fields were declared
 * in. String inputs are split on commas, with a `-` or `+` prefix selecting the direction, and object inputs are
 * walked recursively, joining the nested keys with a dot.
 *
 * @param {QuerySort} sort - The sort input to flatten.
 * @param {string} [parentPath] - The dot notation path of the object the walk descended from.
 * @return {SortEntry[]} The flattened sort entries, each holding a dot notation field path and its direction.
 * @throws {HttpError} 400 if a sort value is neither a direction nor a nested object of directions.
 */
function sortEntries(sort: QuerySort, parentPath: string = ''): SortEntry[] {
  if (isString(sort)) {
    return sort
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && part !== '-' && part !== '+')
      .map((part) => [
        part.replace(/^[-+]/, ''),
        part.startsWith('-') ? 'desc' : 'asc'
      ]);
  }

  if (!isPlainObject(sort)) {
    throw new HttpError(
      `Invalid sort value${parentPath ? ` for the '${parentPath}' field` : ''}, ` +
        'expected a field list string or a sort object',
      400
    );
  }

  const entries: SortEntry[] = [];

  for (const [field, value] of Object.entries(sort)) {
    if (value === undefined || value === null) {
      continue;
    }

    const path = parentPath ? `${parentPath}.${field}` : field;

    if (isPlainObject(value)) {
      entries.push(...sortEntries(value as QuerySort, path));
      continue;
    }

    if (value !== 'asc' && value !== 'desc') {
      throw new HttpError(
        `Invalid sort direction '${value}' for the '${path}' field, expected 'asc' or 'desc'`,
        400
      );
    }

    entries.push([path, value]);
  }

  return entries;
}

/**
 * Resolves a single sort field path against the model it is applied on, validating every segment and rewriting the
 * relation counts to their `_count` form. Relation segments are additionally checked against the relations the action
 * includes in its response, since a relation that is not included cannot be sorted by.
 *
 * @param {string} resourceName - The name of the model the path starts at.
 * @param {string} path - The dot notation field path to resolve.
 * @param {Object} inclusions - The `include` clause of the action, as built by {@link mapRelationInclusions}.
 * @return {string|undefined} The resolved dot notation path, or undefined when the field is the `createdAt` audit
 * field of a model that does not audit it, in which case the sort entry is dropped.
 * @throws {HttpError} 400 if a segment does not exist on its model, cannot be sorted by, or targets a relation the
 * action does not include in its response.
 */
function mapSortPath(
  resourceName: string,
  path: string,
  inclusions: Record<string, any>
): string | undefined {
  const segments = path.split('.').filter((segment) => segment.length > 0);

  const mappedSegments: string[] = [];

  let modelName = resourceName;
  let modelInclusions = inclusions;

  for (const [index, field] of segments.entries()) {
    const model = injectModel(modelName, false);
    if (!model) {
      throw new HttpError(
        `Cannot sort by the '${path}' field, the '${modelName}' model is not loaded`,
        400
      );
    }

    const isLast = index === segments.length - 1;
    const relation = relationField(model, field);

    // A scalar field ends the path, so it is the only segment a relation of the
    // same name cannot shadow
    if (!relation && isScalarField(model, field)) {
      if (!isLast) {
        throw new HttpError(
          `Cannot sort by the '${path}' field, '${field}' is not a relation of the ${model.name} model`,
          400
        );
      }
      // The default sort still names the createdAt field on the models that do
      // not audit it, so the entry is dropped instead of rejected
      if (field === 'createdAt' && model.config.audit?.createdAt === false) {
        return undefined;
      }
      mappedSegments.push(field);
      break;
    }

    // A count field sorts by the number of related records, which the database
    // orders by through the _count aggregation of the relation
    if (!relation && isLast && isCountField(field)) {
      const countedField = field.slice(0, -'Count'.length);
      const countedRelation = relationField(model, countedField);
      if (countedRelation && isFieldArray(countedRelation)) {
        mappedSegments.push(countedField, '_count');
        break;
      }
    }

    if (!relation) {
      throw new HttpError(
        `Cannot sort by the '${path}' field, '${field}' is not a sortable field of the ${model.name} model`,
        400
      );
    }

    // A to-many relation holds no single value to sort by, so it is sorted by
    // the number of its related records instead
    if (isFieldArray(relation)) {
      if (!isLast) {
        throw new HttpError(
          `Cannot sort by the '${path}' field, the '${field}' relation holds a list of records, ` +
            `sort by the '${countFieldName(field)}' field instead`,
          400
        );
      }
      mappedSegments.push(field, '_count');
      break;
    }

    if (isLast) {
      throw new HttpError(
        `Cannot sort by the '${path}' field, the '${field}' relation requires a nested field to sort by`,
        400
      );
    }

    const inclusion = modelInclusions?.[field];
    if (!inclusion) {
      throw new HttpError(
        `Cannot sort by the '${path}' field, the '${field}' relation is not included in the response`,
        400
      );
    }

    mappedSegments.push(field);
    modelName = capitalize(relatedModelName(model, field));
    modelInclusions = isPlainObject(inclusion) ? inclusion.include : undefined;
  }

  return mappedSegments.join('.');
}

/**
 * Reads the relation or file field configuration of a model field.
 *
 * @param {ResourceModel} model - The model the field belongs to.
 * @param {string} field - The name of the field to read.
 * @return {RelationField|FileField|undefined} The relation or file configuration of the field, or undefined when the
 * field is not a relation.
 */
function relationField(
  model: ResourceModel,
  field: string
): RelationField | FileField | undefined {
  return model.config.relations?.[field] ?? model.config.files?.[field];
}

/**
 * Resolves the model name a relation or file field of a model points at.
 *
 * @param {ResourceModel} model - The model the relation belongs to.
 * @param {string} field - The name of the relation field.
 * @return {string} The name of the related model, which is always `File` for a file field.
 */
function relatedModelName(model: ResourceModel, field: string): string {
  return model.config.relations?.[field]?.model ?? 'File';
}

/**
 * Determines whether a relation or file field holds a list of related records, which can only be sorted by their
 * count.
 *
 * @param {RelationField|FileField} field - The relation or file field configuration.
 * @return {boolean} True when the field holds a list of related records.
 */
function isFieldArray(field: RelationField | FileField): boolean {
  return 'model' in field ? isRelationArray(field) : field.array === true;
}

/**
 * Determines whether a model field is a scalar column the database can sort by. The id and the audited fields are
 * always sortable, the configured scalars are sortable unless they are hidden or hold a list of values, and the
 * virtual fields are never sortable, since they have no column of their own.
 *
 * @param {ResourceModel} model - The model the field belongs to.
 * @param {string} field - The name of the field to check.
 * @return {boolean} True when the field can be sorted by.
 */
function isScalarField(model: ResourceModel, field: string): boolean {
  if (field === 'id') {
    return true;
  }

  const auditFields = { ...defaultAuditFields, ...(model.config.audit ?? {}) };
  if (field in auditFields) {
    // The createdAt field of a model that does not audit it is still accepted,
    // so the default sort value does not have to be adjusted per model
    return auditFields[field] === true || field === 'createdAt';
  }

  const scalar = model.config.scalars?.[field];

  return !!scalar && !scalar.hidden && scalar.array !== true;
}
