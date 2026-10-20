import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AnyJson,
  AuthType,
  BulkRouteConfig,
  camelToSnakeCase,
  CaptchaConfig,
  config,
  CONFIG_NAME,
  ErrorCode,
  IdField,
  idFieldType,
  Nullable,
  plural,
  ResourceSchemaConfig,
  StringDate
} from '@appweaver/common';
import { resourceConfig } from './resource-config';
import { injectModel } from '../context';
import {
  authErrorCodes,
  authSchema,
  captchaErrorCodes,
  captchaHeaderSchema
} from '../security';
import { errorResponses } from '../errors';
import { createSchemaModel } from '../utils';
import {
  aggregateDateFieldSchema,
  aggregateSelectName,
  queryFilterName,
  querySortSchema,
  registerAggregateSelectSchemas,
  registerQueryFilterSchemas,
  registerQuerySortSchemas
} from './schemas';
import { ResourceRouteName } from './utils';

// Maximum length of a string primary key, sized for the longest value the
// supported generators produce (a 36-character UUID)
export const ID_STRING_MAX_LENGTH = 36;

export const Id = Type.Object({
  id: Type.Integer({ minimum: 1, example: 1 })
});

export const IdString = Type.Object({
  id: Type.String({ maxLength: ID_STRING_MAX_LENGTH, example: 'a1b2c3d4' })
});

const CURSOR_EXAMPLE = 'eyJpIjo0MiwiZiI6IkhkQjVfa2VMTVlyNyJ9';

// A JSON-encoded query parameter. The reference is wrapped, since the OpenAPI
// document drops the siblings of a $ref
const JsonParam = (ref: string, description: string): TSchema =>
  Type.Unsafe({
    allOf: [Type.Ref(ref)],
    description,
    'x-consume': 'application/json'
  });

// The sort property is declared per model instead, since its object form
// references the sortable fields of the queried resource
export const QueryRequestData = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, example: 1 })),
  size: Type.Optional(Type.Number({ minimum: 0, maximum: 2000, example: 50 })),
  cursor: Nullable(Type.String({ example: CURSOR_EXAMPLE })),
  totalCount: Type.Optional(Type.Boolean({ default: true, example: true }))
});

// The absent values are returned as null rather than omitted, so a client reads
// "no further page" and "not counted" off the response instead of a missing key
export const QueryResponseData = Type.Object({
  resultCount: Type.Number({ example: 10 }),
  totalCount: Nullable(Type.Number({ example: 100 })),
  nextCursor: Nullable(Type.String({ example: CURSOR_EXAMPLE })),
  prevCursor: Nullable(Type.String({ example: CURSOR_EXAMPLE }))
});

// The select and dateField properties are declared per model instead, since
// they reference the aggregatable fields of the aggregated resource
export const AggregateRequestData = Type.Object({
  from: Type.Optional(StringDate()),
  to: Type.Optional(StringDate()),
  step: Type.Optional(Type.Integer({ minimum: 1, example: 3600 })),
  safeIncrement: Type.Optional(Type.Boolean({ example: true }))
});

// The fields of a result follow the selection of the request, so they are left
// open, while the response must still declare its properties to serialize them
const AggregateResult = AnyJson({
  example: { price: { sum: 1250, avg: 62.5 } }
});

export const AggregateResponseData = Type.Object({
  total: AggregateResult,
  items: Type.Array(
    Type.Object({
      date: StringDate(),
      result: AggregateResult
    })
  )
});

// Every item of a bulk request is applied, or none, so a response without the
// records only counts them
export const BulkResponse = Type.Object(
  {
    success: Type.Boolean({ example: true }),
    count: Type.Integer({ minimum: 0, example: 2 })
  },
  { $id: 'BulkResponse' }
);

/**
 * Builds the route schemas of every resource route of a model, with the security, bot check headers, and error
 * responses of each route.
 *
 * @param {string} name - The model name.
 * @param {Object} routeAuthTypes - The authentication types accepted by each route.
 * @param {Object} routeCaptcha - The bot check config of each route.
 * @param {Object} [routeBulk={}] - The maximum items and the response type of each bulk route.
 * @return {ResourceSchemaConfig} The schema of each route.
 */
export function createSchema(
  name: string,
  routeAuthTypes: Record<ResourceRouteName, AuthType[] | undefined>,
  routeCaptcha: Record<ResourceRouteName, CaptchaConfig>,
  routeBulk: Partial<
    Record<
      ResourceRouteName,
      Pick<BulkRouteConfig, 'maxItems' | 'returnRecords'>
    >
  > = {}
): ResourceSchemaConfig {
  const resourceModel = injectModel(name);

  const resourceName = camelToSnakeCase(name, ' ');
  const tag = plural(name);

  // The path parameter follows the primary key type of this model, so a string
  // id is neither coerced to a number nor rejected by the request validation
  const idParams = resourceModel.idModel;

  // The errors of a route, along with the ones of its authentication
  const routeErrors = (route: ResourceRouteName, ...codes: ErrorCode[]) =>
    errorResponses(
      ...authErrorCodes(routeAuthTypes[route]),
      ...captchaErrorCodes(routeCaptcha[route]),
      ErrorCode.DatabaseOperationFailed,
      ErrorCode.DatabaseUnavailable,
      ...codes
    );

  const createErrors = [
    ErrorCode.ResourceForbidden,
    ErrorCode.ResourceInvalidRelation,
    ErrorCode.DatabaseUniqueViolation,
    ErrorCode.DatabaseForeignKeyViolation,
    ErrorCode.DatabaseNullViolation,
    ErrorCode.DatabaseValueTooLong,
    ErrorCode.DatabaseValueOutOfRange,
    ErrorCode.DatabaseInvalidValue
  ];

  const updateErrors = [
    ErrorCode.ResourceNotFound,
    ErrorCode.ResourceForbidden,
    ErrorCode.ResourceInvalidRelation,
    ErrorCode.ResourceDeleteRestricted,
    ErrorCode.DatabaseWriteConflict,
    ErrorCode.DatabaseUniqueViolation,
    ErrorCode.DatabaseForeignKeyViolation,
    ErrorCode.DatabaseNullViolation,
    ErrorCode.DatabaseValueTooLong,
    ErrorCode.DatabaseValueOutOfRange,
    ErrorCode.DatabaseInvalidValue
  ];

  const deleteErrors = [
    ErrorCode.ResourceNotFound,
    ErrorCode.ResourceForbidden,
    ErrorCode.ResourceDeleteRestricted,
    ErrorCode.DatabaseForeignKeyViolation
  ];

  // The items of a bulk request, between one and the maximum of the route
  const bulkItems = (route: ResourceRouteName, items: TSchema) =>
    Type.Array(items, {
      minItems: 1,
      maxItems: routeBulk[route]?.maxItems ?? resourceConfig.BULK_MAX_ITEMS
    });

  const idValue = idParams.properties.id;

  const bulkItem = (data: string) =>
    Type.Object({ id: idValue, data: Type.Ref(data) });

  // The records a bulk request applied, as its single route responds with each,
  // or only their count
  const bulkResponse = (route: ResourceRouteName) =>
    (routeBulk[route]?.returnRecords ?? resourceConfig.BULK_RETURN_RECORDS)
      ? Type.Array(Type.Ref(`${name}Single`))
      : createSchemaModel(BulkResponse);

  // Register the recursive query filter and sort schemas of all loaded models,
  // referenced by the query, aggregate, and export request bodies
  registerQueryFilterSchemas();
  registerQuerySortSchemas();
  registerAggregateSelectSchemas();

  const filterData = Type.Object({
    filter: Type.Optional(Type.Ref(queryFilterName(name)))
  });

  const sortData = Type.Object({
    sort: querySortSchema(name)
  });

  const queryRequest = Type.Composite(
    [filterData, sortData, QueryRequestData],
    {
      $id: `${name}QueryRequest`
    }
  );

  const queryResponse = Type.Composite(
    [
      QueryResponseData,
      Type.Object({
        items: Type.Array(resourceModel.readManyModel)
      })
    ],
    { $id: `${name}QueryResponse` }
  );

  const selectData = Type.Object({
    select: Type.Ref(aggregateSelectName(name)),
    dateField: aggregateDateFieldSchema(resourceModel)
  });

  const aggregateRequest = Type.Composite(
    [filterData, selectData, AggregateRequestData],
    { $id: `${name}AggregateRequest` }
  );

  const aggregateResponse = Type.Composite([AggregateResponseData], {
    $id: `${name}AggregateResponse`
  });

  const exportRequest = Type.Composite([filterData, sortData], {
    $id: `${name}ExportRequest`
  });

  // Inline, since the OpenAPI document derives the query parameters from them
  const filterParam = Type.Object({
    filter: Type.Optional(
      JsonParam(queryFilterName(name), 'The query filter, encoded as JSON')
    )
  });

  const sortParam = Type.Object({
    sort: querySortSchema(
      name,
      'Fields to sort the results by, given as a comma-separated field list ' +
        'or as a JSON-encoded object of field directions'
    )
  });

  const queryParams = Type.Composite([
    filterParam,
    sortParam,
    QueryRequestData
  ]);

  const aggregateParams = Type.Composite([
    filterParam,
    Type.Object({
      select: JsonParam(
        aggregateSelectName(name),
        'The aggregate selection, encoded as JSON'
      ),
      dateField: aggregateDateFieldSchema(resourceModel)
    }),
    AggregateRequestData
  ]);

  const resourceSchemaConfig = {
    findSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['find']),
      headers: captchaHeaderSchema(routeCaptcha['find']),
      summary: `Find ${resourceName} data`,
      description: `Find ${resourceName} data`,
      response: {
        200: resourceModel.readOneModel,
        ...routeErrors(
          'find',
          ErrorCode.ResourceNotFound,
          ErrorCode.ResourceForbidden
        )
      },
      params: idParams
    },
    querySchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['query']),
      headers: captchaHeaderSchema(routeCaptcha['query']),
      summary: `Query ${resourceName} data`,
      description: `Query ${resourceName} data`,
      response: {
        200: createSchemaModel(queryResponse),
        ...routeErrors(
          'query',
          ErrorCode.ResourceInvalidSort,
          ErrorCode.ResourceInvalidCursor
        )
      },
      body: createSchemaModel(queryRequest)
    },
    aggregateSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['aggregate']),
      headers: captchaHeaderSchema(routeCaptcha['aggregate']),
      summary: `Aggregate ${resourceName} data`,
      description: `Aggregate ${resourceName} data`,
      response: {
        200: createSchemaModel(aggregateResponse),
        ...routeErrors('aggregate', ErrorCode.ResourceInvalidAggregate)
      },
      body: createSchemaModel(aggregateRequest)
    },
    queryGetSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['query']),
      headers: captchaHeaderSchema(routeCaptcha['query']),
      summary: `Query ${resourceName} data with query parameters`,
      description: `Query ${resourceName} data with query parameters`,
      response: {
        200: createSchemaModel(queryResponse),
        ...routeErrors(
          'query',
          ErrorCode.ResourceInvalidSort,
          ErrorCode.ResourceInvalidCursor,
          ErrorCode.ResourceInvalidQueryParameter
        )
      },
      querystring: queryParams,
      [`x-${CONFIG_NAME}-request`]: `${name}QueryRequest`
    },
    aggregateGetSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['aggregate']),
      headers: captchaHeaderSchema(routeCaptcha['aggregate']),
      summary: `Aggregate ${resourceName} data with query parameters`,
      description: `Aggregate ${resourceName} data with query parameters`,
      response: {
        200: createSchemaModel(aggregateResponse),
        ...routeErrors(
          'aggregate',
          ErrorCode.ResourceInvalidAggregate,
          ErrorCode.ResourceInvalidQueryParameter
        )
      },
      querystring: aggregateParams,
      [`x-${CONFIG_NAME}-request`]: `${name}AggregateRequest`
    },
    createSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['create']),
      headers: captchaHeaderSchema(routeCaptcha['create']),
      summary: `Create ${resourceName} data`,
      description: `Create ${resourceName} data`,
      response: {
        201: resourceModel.readOneModel,
        ...routeErrors('create', ...createErrors)
      },
      body: resourceModel.createOneModel
    },
    updateSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['update']),
      headers: captchaHeaderSchema(routeCaptcha['update']),
      summary: `Update ${resourceName} data`,
      description: `Update the given fields of ${resourceName} data`,
      response: {
        200: resourceModel.readOneModel,
        ...routeErrors('update', ...updateErrors)
      },
      body: resourceModel.updateOneModel,
      params: idParams
    },
    replaceSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['replace']),
      headers: captchaHeaderSchema(routeCaptcha['replace']),
      summary: `Replace ${resourceName} data`,
      description:
        `Replace ${resourceName} data as a whole. The fields left out are ` +
        'reset to their default value, or to null, while the optional ' +
        'relations left out stay untouched',
      response: {
        200: resourceModel.readOneModel,
        ...routeErrors('replace', ...updateErrors)
      },
      body: resourceModel.replaceOneModel,
      params: idParams
    },
    deleteSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['delete']),
      headers: captchaHeaderSchema(routeCaptcha['delete']),
      summary: `Delete ${resourceName} data`,
      description: `Delete ${resourceName} data`,
      response: {
        200: resourceModel.readOneModel,
        ...routeErrors('delete', ...deleteErrors)
      },
      params: idParams
    },
    exportSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['export']),
      headers: captchaHeaderSchema(routeCaptcha['export']),
      summary: `Export ${resourceName} data`,
      description: `Export ${resourceName} data`,
      response: {
        200: {
          content: {
            'text/csv': {
              schema: Type.String({ format: 'binary' })
            }
          }
        },
        ...routeErrors(
          'export',
          ErrorCode.ResourceInvalidSort,
          ErrorCode.ExportFailed
        )
      },
      body: createSchemaModel(exportRequest)
    },
    fileUploadSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['fileUpload']),
      headers: captchaHeaderSchema(routeCaptcha['fileUpload']),
      summary: `Upload ${resourceName} files`,
      description: `Upload ${resourceName} files`,
      consumes: ['multipart/form-data'],
      response: {
        200: resourceModel.filesModel,
        ...routeErrors(
          'fileUpload',
          ErrorCode.ResourceNotFound,
          ErrorCode.ResourceForbidden,
          ErrorCode.FileFieldNotFound,
          ErrorCode.FileUnsupportedType,
          ErrorCode.FileTooLarge,
          ErrorCode.FileLimitExceeded,
          ErrorCode.FileInvalidPath,
          ErrorCode.FileForbidden,
          ErrorCode.FileUploadFailed,
          ErrorCode.FileStorageError
        )
      },
      body: resourceModel.fileUploadModel,
      params: idParams
    },
    fileDeleteSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['fileDelete']),
      headers: captchaHeaderSchema(routeCaptcha['fileDelete']),
      summary: `Delete ${resourceName} files`,
      description: `Delete ${resourceName} files`,
      response: {
        200: resourceModel.filesModel,
        ...routeErrors(
          'fileDelete',
          ErrorCode.ResourceNotFound,
          ErrorCode.ResourceForbidden,
          ErrorCode.FileNotFound,
          ErrorCode.FileForbidden,
          ErrorCode.FileNoneProvided,
          ErrorCode.FileDeleteFailed,
          ErrorCode.FileStorageError
        )
      },
      body: resourceModel.fileDeleteModel,
      params: idParams
    },
    bulkCreateSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['bulkCreate']),
      headers: captchaHeaderSchema(routeCaptcha['bulkCreate']),
      summary: `Create many ${resourceName} data`,
      description:
        `Create many ${resourceName} data in a single transaction, ` +
        'either every item or none',
      response: {
        201: bulkResponse('bulkCreate'),
        ...routeErrors('bulkCreate', ...createErrors)
      },
      body: bulkItems('bulkCreate', Type.Ref(`${name}Create`))
    },
    bulkUpdateSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['bulkUpdate']),
      headers: captchaHeaderSchema(routeCaptcha['bulkUpdate']),
      summary: `Update many ${resourceName} data`,
      description:
        `Update the given fields of many ${resourceName} data in a single ` +
        'transaction, either every item or none',
      response: {
        200: bulkResponse('bulkUpdate'),
        ...routeErrors('bulkUpdate', ...updateErrors)
      },
      body: bulkItems('bulkUpdate', bulkItem(`${name}Update`))
    },
    bulkReplaceSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['bulkReplace']),
      headers: captchaHeaderSchema(routeCaptcha['bulkReplace']),
      summary: `Replace many ${resourceName} data`,
      description:
        `Replace many ${resourceName} data as a whole in a single ` +
        'transaction, either every item or none',
      response: {
        200: bulkResponse('bulkReplace'),
        ...routeErrors('bulkReplace', ...updateErrors)
      },
      body: bulkItems('bulkReplace', bulkItem(`${name}Replace`))
    },
    bulkDeleteSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['bulkDelete']),
      headers: captchaHeaderSchema(routeCaptcha['bulkDelete']),
      summary: `Delete many ${resourceName} data`,
      description:
        `Delete many ${resourceName} data by their ids in a single ` +
        'transaction, either every item or none',
      response: {
        200: bulkResponse('bulkDelete'),
        ...routeErrors('bulkDelete', ...deleteErrors)
      },
      body: Type.Array(idValue, {
        minItems: 1,
        maxItems:
          routeBulk['bulkDelete']?.maxItems ?? resourceConfig.BULK_MAX_ITEMS,
        uniqueItems: true
      })
    }
  };

  for (const schemaConfig of Object.values(resourceSchemaConfig)) {
    schemaConfig[`x-${CONFIG_NAME}-resource`] = name;
  }

  return resourceSchemaConfig;
}

/**
 * Builds the schema of a single primary key value, used wherever an id is
 * accepted on its own (i.e. a relation input connecting an existing record).
 *
 * @param {IdField} [idField] - The id configuration, integer by default.
 * @return {TSchema} The schema of the id value.
 */
export function idValueSchema(idField?: IdField): TSchema {
  return idFieldType(idField) === 'string'
    ? IdString.properties.id
    : Id.properties.id;
}

/**
 * Builds the primary key schema of a model, used as the route path parameter
 * and as the connection shape of the relation inputs pointing at the model. A
 * fresh object per call, since each model annotates its own schemas.
 *
 * @param {IdField} [idField] - The id configuration, integer by default.
 * @return {TObject} The primary key schema of the model.
 */
export function idSchema(idField?: IdField): TObject {
  return Type.Object({ id: idValueSchema(idField) });
}

/**
 * Builds the audit field schema of a model. The `createdById` field references
 * the authentication model, so it follows that model's id type.
 *
 * @param {IdField} [authIdField] - The auth model id configuration, integer by default.
 * @return {TObject} The schema holding all supported audit fields.
 */
export function auditSchema(authIdField?: IdField): TObject {
  return Type.Object({
    updatedAt: StringDate(),
    createdAt: StringDate(),
    createdById: Nullable(idValueSchema(authIdField))
  });
}
