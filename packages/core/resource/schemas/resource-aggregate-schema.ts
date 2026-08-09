import { TObject, TSchema, Type } from '@sinclair/typebox';
import { ResourceModel } from '@appweaver/common';
import { context } from '../../context';
import { createSchemaModel } from '../../utils';
import { aggregateFields } from '../utils';

/** The schema name the numeric field operator object is registered under. */
export const AGGREGATE_NUMERIC_SCHEMA_NAME = 'AggregateNumericOperators';

/** The schema name the date field operator object is registered under. */
export const AGGREGATE_DATE_SCHEMA_NAME = 'AggregateDateOperators';

/**
 * Resolves the schema name the aggregate selection of a model is registered
 * under.
 *
 * @param {string} modelName The resource model name (i.e. `User`, `Post`).
 * @returns {string} The aggregate selection schema name (i.e. `UserAggregateSelect`).
 */
export const aggregateSelectName = (modelName: string): string =>
  `${modelName}AggregateSelect`;

const Operator = (description: string): TSchema =>
  Type.Optional(Type.Boolean({ description, example: true }));

// The boundary operators read the record itself instead of aggregating the
// range, so their value is the one the record holds, null included
const FIRST_DESCRIPTION =
  'Takes the value held by the earliest record of the range, ordered by the ' +
  'aggregated date field';
const LAST_DESCRIPTION =
  'Takes the value held by the latest record of the range, ordered by the ' +
  'aggregated date field';

/**
 * The operators applicable to a numeric field. Every operator selected on the
 * same field is applied to it, and the field is left out of the response of the
 * operators that were not selected.
 */
export const AggregateNumericSchema: TObject = Type.Object(
  {
    count: Operator('Counts the records with a non-null value'),
    sum: Operator('Sums the values'),
    avg: Operator('Averages the values'),
    min: Operator('Takes the lowest value'),
    max: Operator('Takes the highest value'),
    first: Operator(FIRST_DESCRIPTION),
    last: Operator(LAST_DESCRIPTION)
  },
  {
    description: 'Aggregation operators applicable to a numeric field'
  }
);

/**
 * The operators applicable to a date field. Dates cannot be summed or averaged,
 * so only the counting and the ordering operators are offered.
 */
export const AggregateDateSchema: TObject = Type.Object(
  {
    count: Operator('Counts the records with a non-null value'),
    min: Operator('Takes the earliest date'),
    max: Operator('Takes the latest date'),
    first: Operator(FIRST_DESCRIPTION),
    last: Operator(LAST_DESCRIPTION)
  },
  {
    description: 'Aggregation operators applicable to a date field'
  }
);

/**
 * Builds the aggregate selection schema of a resource model. Only the fields
 * the database can aggregate are declared, which are the numeric and the date
 * scalars of the model together with its numeric id and audit fields, so the
 * request validation keeps the known fields and strips everything else
 * (including hidden fields, array scalars, and the virtual fields that have no
 * column of their own).
 *
 * @param {ResourceModel} model The resource model to build the selection schema
 * for.
 * @returns {TObject} The aggregate selection schema of the model.
 */
export function buildAggregateSelectSchema(model: ResourceModel): TObject {
  const properties: Record<string, TSchema> = {};

  for (const [fieldName, type] of aggregateFields(model)) {
    properties[fieldName] = Type.Optional(
      Type.Ref(
        type === 'numeric'
          ? AGGREGATE_NUMERIC_SCHEMA_NAME
          : AGGREGATE_DATE_SCHEMA_NAME
      )
    );
  }

  return Type.Object(properties, {
    description:
      `Aggregate selection for the ${model.name} resource, holding the ` +
      'operators to apply per aggregated field'
  });
}

/**
 * Builds the schema of the date field property of a model, listing the date
 * fields the aggregated range can be applied on.
 *
 * @param {ResourceModel} model The resource model the property belongs to.
 * @returns {TSchema} The optional date field property schema, restricted to the
 * date fields of the model when it declares any.
 */
export function aggregateDateFieldSchema(model: ResourceModel): TSchema {
  const dateFields = aggregateFields(model)
    .filter(([, type]) => type === 'date')
    .map(([fieldName]) => fieldName);

  const description = 'The date field the aggregated range is applied on';

  // A model without a single date field has no range to aggregate over, so the
  // property is left unrestricted instead of declaring an empty enum that
  // nothing can satisfy
  return Type.Optional(
    dateFields.length > 0
      ? Type.Unsafe<string>({
          type: 'string',
          enum: dateFields,
          // The default date field of the aggregate action, when the model
          // audits it, so the example matches what an omitted value resolves to
          example: dateFields.includes('createdAt')
            ? 'createdAt'
            : dateFields[0],
          description
        })
      : Type.String({ example: 'createdAt', description })
  );
}

/**
 * Registers the shared operator schemas and the aggregate selection schema of
 * every loaded resource model on the server, so route schemas can reference them
 * by name (i.e. `UserAggregateSelect`). Schemas already registered under the
 * same name are skipped, which makes repeated calls cheap.
 */
export function registerAggregateSelectSchemas(): void {
  createSchemaModel(AggregateNumericSchema, {
    name: AGGREGATE_NUMERIC_SCHEMA_NAME
  });
  createSchemaModel(AggregateDateSchema, {
    name: AGGREGATE_DATE_SCHEMA_NAME
  });

  for (const model of context.resource.models.values()) {
    createSchemaModel(buildAggregateSelectSchema(model), {
      name: aggregateSelectName(model.name)
    });
  }
}
