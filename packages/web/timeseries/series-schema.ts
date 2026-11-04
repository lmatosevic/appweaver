import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  ErrorCode,
  Nullable,
  RouteSchema,
  StringDate
} from '@appweaver/common';
import { createSchemaModel, timeseriesConfig } from '@appweaver/core';

/** What the series schemas of a model are built from. */
export type SeriesSchemaContext = {
  /** The model name */
  name: string;
  /** The resource name in the summaries, i.e. `sensor` */
  resourceName: string;
  /** The tag of the routes */
  tag: string;
  /** The `:id` path parameter */
  idParams: TObject;
  /** The schema of an id value */
  idValue: TSchema;
  /** The values of the series fields */
  seriesModel: TObject;
  /** The name of the query filter schema of the model */
  filterName: string;
  /** The maximum number of points of a write */
  maxPoints?: number;
  /** Whether a write accepts `ingest=direct` */
  allowDirect?: boolean;
  /** The security and bot check headers of a route */
  route: (
    route: 'seriesWrite' | 'seriesQuery' | 'seriesDelete'
  ) => Pick<RouteSchema, 'security' | 'headers'>;
  /** The error responses of a route */
  errors: (
    route: 'seriesWrite' | 'seriesQuery' | 'seriesDelete',
    ...codes: ErrorCode[]
  ) => Record<number, unknown>;
};

const TimeInput = Type.Union([
  StringDate({ example: '2026-01-01T12:00:00.000Z' }),
  Type.Integer({ minimum: 0, example: 1767268800000 })
]);

const RangeInput = {
  from: Type.Optional(
    StringDate({ description: 'Start of the time range, inclusive' })
  ),
  to: Type.Optional(
    StringDate({ description: 'End of the time range, exclusive' })
  )
};

const QueryInput = {
  ...RangeInput,
  bucket: Type.Optional(
    Type.String({
      pattern: '^\\d+(ms|s|m|h|d|w)?$',
      description: 'Bucket width aggregating the points, i.e. 15m, 1h, 1d',
      example: '1h'
    })
  ),
  aggregate: Type.Optional(
    Type.Union(
      ['avg', 'min', 'max', 'sum', 'count', 'first', 'last'].map((value) =>
        Type.Literal(value)
      ),
      { description: 'Aggregate of a bucket (default: avg)' }
    )
  ),
  order: Type.Optional(
    Type.Union([Type.Literal('asc'), Type.Literal('desc')], {
      description: 'Order of the points by their time (default: asc)'
    })
  ),
  limit: Type.Optional(Type.Integer({ minimum: 1, example: 1000 }))
};

const WriteResponse = Type.Object(
  {
    count: Type.Integer({ minimum: 0, example: 10 }),
    queued: Type.Boolean({ example: false })
  },
  { $id: 'SeriesWriteResponse' }
);

/**
 * Builds the schemas of the time series routes of a model: the write, query and delete of the points of a resource,
 * and the write and query of the points of many.
 *
 * @param {SeriesSchemaContext} context - The model and the route parts.
 * @return {Object} The schema of each series route.
 */
export function createSeriesSchemas(context: SeriesSchemaContext): {
  seriesWriteSchema: RouteSchema;
  seriesBulkWriteSchema: RouteSchema;
  seriesQuerySchema: RouteSchema;
  seriesBulkQuerySchema: RouteSchema;
  seriesDeleteSchema: RouteSchema;
} {
  const { name, resourceName, tag, idParams, idValue, seriesModel } = context;
  const values = seriesModel.properties;

  // An aggregate of a boolean field (avg, sum) is a number
  const outputValues = Object.fromEntries(
    Object.entries(values).map(([field, schema]) => [
      field,
      schema.type === 'boolean'
        ? Type.Optional(
            Type.Union([Type.Boolean(), Type.Number(), Type.Null()])
          )
        : Type.Optional(Nullable(Type.Number()))
    ])
  );

  const point = Type.Object(
    { time: Type.Optional(TimeInput), ...values },
    { additionalProperties: false }
  );
  const bulkPoint = Type.Object(
    { resourceId: idValue, time: Type.Optional(TimeInput), ...values },
    { additionalProperties: false }
  );
  // Named, so the generated client types the series of each model
  const named = (schema: TObject, suffix: string) =>
    createSchemaModel(schema, { name: `${name}${suffix}` });
  const points = (item: TSchema, suffix: string) =>
    named(
      Type.Object({
        points: Type.Array(item, {
          minItems: 1,
          maxItems: context.maxPoints ?? timeseriesConfig.MAX_POINTS_PER_WRITE
        })
      }),
      suffix
    );
  const ingest = Type.Object({
    ingest: Type.Optional(
      Type.Literal('direct', {
        description:
          context.allowDirect === false
            ? 'Ignored, the route queues the points of a model queueing them'
            : 'Write the points in the request instead of queueing them'
      })
    )
  });

  const writeErrors = [
    ErrorCode.ResourceNotFound,
    ErrorCode.ResourceForbidden,
    ErrorCode.TimeSeriesForbidden,
    ErrorCode.TimeSeriesInvalidField,
    ErrorCode.TimeSeriesInvalidValue,
    ErrorCode.TimeSeriesInvalidTime,
    ErrorCode.TimeSeriesTooManyPoints,
    ErrorCode.TimeSeriesUnavailable,
    ErrorCode.DatabaseForeignKeyViolation,
    ErrorCode.QueueUnavailable
  ];
  const queryErrors = [
    ErrorCode.ResourceNotFound,
    ErrorCode.ResourceForbidden,
    ErrorCode.TimeSeriesForbidden,
    ErrorCode.TimeSeriesInvalidField,
    ErrorCode.TimeSeriesInvalidRange,
    ErrorCode.TimeSeriesInvalidTime,
    ErrorCode.TimeSeriesInvalidBucket,
    ErrorCode.TimeSeriesInvalidAggregate,
    ErrorCode.TimeSeriesTooManyResources,
    ErrorCode.TimeSeriesUnavailable
  ];
  const writeResponse = (route: 'seriesWrite') => ({
    200: createSchemaModel(WriteResponse),
    202: createSchemaModel(WriteResponse),
    ...context.errors(route, ...writeErrors)
  });

  return {
    seriesWriteSchema: {
      tags: [tag],
      ...context.route('seriesWrite'),
      summary: `Write ${resourceName} time series`,
      description:
        `Write the time series points of a ${resourceName}, merging a point into the one stored at the same time. ` +
        'The points are queued and written by a worker when the model queues them (202).',
      params: idParams,
      querystring: ingest,
      body: points(point, 'SeriesWrite'),
      response: writeResponse('seriesWrite')
    },
    seriesBulkWriteSchema: {
      tags: [tag],
      ...context.route('seriesWrite'),
      summary: `Write many ${resourceName} time series`,
      description: `Write the time series points of many ${resourceName} resources, each point naming its resource.`,
      querystring: ingest,
      body: points(bulkPoint, 'SeriesBulkWrite'),
      response: {
        ...writeResponse('seriesWrite'),
        ...context.errors(
          'seriesWrite',
          ...writeErrors,
          ErrorCode.TimeSeriesTooManyResources
        )
      }
    },
    seriesQuerySchema: {
      tags: [tag],
      ...context.route('seriesQuery'),
      summary: `Query ${resourceName} time series`,
      description: `Query the time series points of a ${resourceName}, aggregated by bucket with a bucket or an aggregate.`,
      params: idParams,
      querystring: Type.Object({
        fields: Type.Optional(
          Type.String({
            description: 'Comma separated fields, every field by default',
            example: Object.keys(values).join(',')
          })
        ),
        ...QueryInput
      }),
      response: {
        200: named(
          Type.Object({
            items: Type.Array(
              Type.Object({ time: StringDate(), ...outputValues })
            )
          }),
          'SeriesPoints'
        ),
        ...context.errors('seriesQuery', ...queryErrors)
      }
    },
    seriesBulkQuerySchema: {
      tags: [tag],
      ...context.route('seriesQuery'),
      summary: `Query many ${resourceName} time series`,
      description: `Query the time series points of the ${resourceName} resources of the ids, the filter, or both.`,
      body: named(
        Type.Object({
          ids: Type.Optional(Type.Array(idValue, { minItems: 1 })),
          filter: Type.Optional(Type.Ref(context.filterName)),
          fields: Type.Optional(
            Type.Array(
              Type.Union(
                Object.keys(values).map((field) => Type.Literal(field))
              )
            )
          ),
          ...QueryInput
        }),
        'SeriesQuery'
      ),
      response: {
        200: named(
          Type.Object({
            items: Type.Array(
              Type.Object({
                resourceId: idValue,
                time: StringDate(),
                ...outputValues
              })
            )
          }),
          'SeriesBulkPoints'
        ),
        ...context.errors('seriesQuery', ...queryErrors)
      }
    },
    seriesDeleteSchema: {
      tags: [tag],
      ...context.route('seriesDelete'),
      summary: `Delete ${resourceName} time series`,
      description: `Delete the time series points of a ${resourceName} within a time range, all of them without one.`,
      params: idParams,
      body: Type.Object(RangeInput),
      response: {
        200: Type.Object({ count: Type.Integer({ minimum: 0 }) }),
        ...context.errors(
          'seriesDelete',
          ErrorCode.ResourceNotFound,
          ErrorCode.ResourceForbidden,
          ErrorCode.TimeSeriesForbidden,
          ErrorCode.TimeSeriesInvalidRange,
          ErrorCode.TimeSeriesInvalidTime,
          ErrorCode.TimeSeriesUnsupported,
          ErrorCode.TimeSeriesUnavailable
        )
      }
    }
  };
}
