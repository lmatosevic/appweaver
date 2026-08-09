import { TObject, TSchema, Type } from '@sinclair/typebox';
import { AuditFields, capitalize, ResourceModel } from '@appweaver/common';
import { context } from '../../context';
import { createSchemaModel } from '../../utils';

/** The schema name the shared field condition object is registered under. */
export const QUERY_CONDITION_SCHEMA_NAME = 'QueryCondition';

/**
 * Resolves the schema name the query filter of a model is registered under.
 *
 * @param {string} modelName The resource model name (i.e. `User`, `Post`).
 * @returns {string} The query filter schema name (i.e. `UserQueryFilter`).
 */
export const queryFilterName = (modelName: string): string =>
  `${modelName}QueryFilter`;

// The primitive types a plain filter value can take. They are declared as a
// single JSON Schema type list rather than a union of typed branches, because
// the request validator coerces a value into the first branch of a typed
// union that accepts it (turning 10 into '10'), while a type list leaves a
// value that already matches one of its types untouched. The exact type of
// each field is enforced by the database layer instead.
const PRIMITIVE_TYPES = ['string', 'number', 'boolean', 'null'];

const PlainValue = (): TSchema => Type.Unsafe({ type: PRIMITIVE_TYPES });

const PlainValueList = (options: Record<string, any> = {}): TSchema =>
  Type.Unsafe({
    type: 'array',
    items: { type: PRIMITIVE_TYPES },
    ...options
  });

const Operator = (schema: TSchema, description: string): TSchema =>
  Type.Optional({ ...schema, description } as TSchema);

/**
 * The shared schema of a field condition object, holding the comparison
 * operators applicable to a single field. Operators combined inside the same
 * object are merged into a single database condition, and unknown properties
 * are stripped by the request validation.
 */
export const QueryConditionSchema: TObject = Type.Object(
  {
    _eq: Operator(PlainValue(), 'Matches values equal to the given value'),
    _ne: Operator(PlainValue(), 'Matches values not equal to the given value'),
    _gt: Operator(PlainValue(), 'Matches values greater than the given value'),
    _gte: Operator(
      PlainValue(),
      'Matches values greater than or equal to the given value'
    ),
    _lt: Operator(PlainValue(), 'Matches values lower than the given value'),
    _lte: Operator(
      PlainValue(),
      'Matches values lower than or equal to the given value'
    ),
    _in: Operator(
      PlainValueList(),
      'Matches values included in the given list'
    ),
    _nin: Operator(
      PlainValueList(),
      'Matches values not included in the given list'
    ),
    _between: Operator(
      PlainValueList({ minItems: 2, maxItems: 2 }),
      'Matches values inside the inclusive [min, max] range'
    ),
    _like: Operator(
      Type.String(),
      'Matches strings against an SQL LIKE pattern with % wildcards'
    ),
    _ilike: Operator(
      Type.String(),
      'Case-insensitive variant of the _like operator'
    ),
    _starts: Operator(
      Type.String(),
      'Matches strings starting with the given value'
    ),
    _ends: Operator(
      Type.String(),
      'Matches strings ending with the given value'
    ),
    _contains: Operator(
      Type.String(),
      'Matches strings containing the given value'
    ),
    _exists: Operator(
      Type.Boolean(),
      'Matches values that are not null (true) or null (false)'
    ),
    _has: Operator(PlainValue(), 'Matches lists containing the given value'),
    _hasSome: Operator(
      PlainValueList(),
      'Matches lists containing at least one of the given values'
    ),
    _hasEvery: Operator(
      PlainValueList(),
      'Matches lists containing all the given values'
    ),
    _isEmpty: Operator(
      Type.Boolean(),
      'Matches empty (true) or non-empty (false) lists'
    ),
    _not: Operator(
      Type.Union([PlainValue(), Type.Ref(QUERY_CONDITION_SCHEMA_NAME)]),
      'Negates the nested condition or plain value'
    )
  },
  {
    description:
      'Field condition object combining comparison operators on a single field'
  }
);

/**
 * Builds the query filter schema of a resource model, mirroring the WHERE part
 * of a database query. Every filterable field of the model is declared
 * explicitly, so the request validation keeps the known fields and strips
 * everything else (including hidden fields). Scalar fields accept a plain
 * value, a list of values, or a condition object, relation and file fields
 * additionally accept an id shorthand or the filter of the related model, and
 * the `_`-prefixed logical operators combine nested conditions recursively.
 *
 * @param {ResourceModel} model The resource model to build the filter schema
 * for.
 * @returns {TObject} The query filter schema of the model.
 */
export function buildQueryFilterSchema(model: ResourceModel): TObject {
  const name = queryFilterName(model.name);

  const self = () => Type.Ref(name);

  const logical = (description: string) =>
    Type.Optional(Type.Union([self(), Type.Array(self())], { description }));

  const scalarValue = (description: string) =>
    Type.Optional(
      Type.Union(
        [PlainValue(), PlainValueList(), Type.Ref(QUERY_CONDITION_SCHEMA_NAME)],
        { description }
      )
    );

  // A list of related filters is declared as its own branch, so the validator
  // still strips the unknown properties of the filters nested inside it
  const relationValue = (refName: string, description: string) =>
    Type.Optional(
      Type.Union(
        [
          PlainValue(),
          PlainValueList(),
          Type.Ref(refName),
          Type.Array(Type.Ref(refName))
        ],
        { description }
      )
    );

  const properties: Record<string, TSchema> = {
    id: scalarValue('Filter by the record id')
  };

  const auditFields: AuditFields = {
    updatedAt: true,
    createdAt: true,
    createdById: true,
    ...(model.config.audit ?? {})
  };
  for (const [fieldName, included] of Object.entries(auditFields)) {
    if (included) {
      properties[fieldName] = scalarValue(`Filter by the ${fieldName} field`);
    }
  }

  for (const [fieldName, scalar] of Object.entries(
    model.config.scalars ?? {}
  )) {
    if (scalar.hidden) {
      continue;
    }
    // JSON fields hold arbitrary nested structures, so their conditions are
    // passed through without validation
    properties[fieldName] =
      scalar.type === 'json'
        ? Type.Optional(
            Type.Any({ description: `Filter by the ${fieldName} field` })
          )
        : scalarValue(`Filter by the ${fieldName} field`);
  }

  for (const [fieldName, relation] of Object.entries(
    model.config.relations ?? {}
  )) {
    properties[fieldName] = relationValue(
      queryFilterName(capitalize(relation.model)),
      `Filter by the ${fieldName} relation, matching an id, a list of ids, ` +
        `or a nested ${capitalize(relation.model)} filter`
    );
  }

  for (const fieldName of Object.keys(model.config.files ?? {})) {
    properties[fieldName] = relationValue(
      queryFilterName('File'),
      `Filter by the ${fieldName} file field, matching an id, a list of ids, ` +
        'or a nested File filter'
    );
  }

  return Type.Object(
    {
      _and: logical('Matches records satisfying all the nested conditions'),
      _or: logical('Matches records satisfying at least one nested condition'),
      _not: logical('Matches records satisfying none of the nested conditions'),
      _nor: logical(
        'Matches records satisfying none of the nested conditions (alias of _not)'
      ),
      _some: Operator(
        self(),
        'Matches records where at least one related record matches the filter'
      ),
      _every: Operator(
        self(),
        'Matches records where every related record matches the filter'
      ),
      _none: Operator(
        self(),
        'Matches records where no related record matches the filter'
      ),
      _exists: Operator(
        Type.Boolean(),
        'Matches records with a related record (true) or without one (false)'
      ),
      searchText: Operator(
        Type.String(),
        'Full-text search input resolved by the resource service'
      ),
      ...properties
    },
    {
      description: `Query filter for the ${model.name} resource`
    }
  );
}

/**
 * Registers the shared field condition schema and the query filter schema of
 * every loaded resource model on the server, so route schemas can reference
 * them by name (i.e. `UserQueryFilter`). Schemas already registered under the
 * same name are skipped, which makes repeated calls cheap.
 */
export function registerQueryFilterSchemas(): void {
  createSchemaModel(QueryConditionSchema, {
    name: QUERY_CONDITION_SCHEMA_NAME
  });

  for (const model of context.resource.models.values()) {
    createSchemaModel(buildQueryFilterSchema(model), {
      name: queryFilterName(model.name)
    });
  }
}
