import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AnyJson,
  AuthType,
  camelToSnakeCase,
  CONFIG_NAME,
  IdField,
  idFieldType,
  Nullable,
  plural,
  RecaptchaConfig,
  ResourceRoutesConfig,
  ResourceSchemaConfig,
  StringDate
} from '@appweaver/common';
import { injectModel } from '../context';
import { authSchema, recaptchaHeaderSchema } from '../security';
import { AllErrorResponses } from '../errors';
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

// Maximum length of a string primary key, sized for the longest value the
// supported generators produce (a 36-character UUID)
export const ID_STRING_MAX_LENGTH = 36;

export const Id = Type.Object({
  id: Type.Integer({ minimum: 1, example: 1 })
});

export const IdString = Type.Object({
  id: Type.String({ maxLength: ID_STRING_MAX_LENGTH, example: 'a1b2c3d4' })
});

// The sort property is declared per model instead, since its object form
// references the sortable fields of the queried resource
export const QueryRequestData = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, example: 1 })),
  size: Type.Optional(Type.Number({ minimum: 0, maximum: 1000, example: 50 }))
});

export const QueryResponseData = Type.Object({
  resultCount: Type.Number({ example: 10 }),
  totalCount: Type.Number({ example: 100 })
});

// The select and dateField properties are declared per model instead, since
// they reference the aggregatable fields of the aggregated resource
export const AggregateRequestData = Type.Object({
  from: Type.Optional(StringDate()),
  to: Type.Optional(StringDate()),
  step: Type.Optional(Type.Integer({ minimum: 1, example: 3600 })),
  safeIncrement: Type.Optional(Type.Boolean({ example: true }))
});

export const AggregateResponseData = Type.Optional(
  AnyJson({ example: { field: 'value' } })
);

export function createSchema(
  name: string,
  routeAuthTypes: Record<keyof ResourceRoutesConfig, AuthType[] | undefined>,
  routeRecaptcha: Record<keyof ResourceRoutesConfig, RecaptchaConfig>
): ResourceSchemaConfig {
  const resourceModel = injectModel(name);

  const resourceName = camelToSnakeCase(name, ' ');
  const tag = plural(name);

  // The path parameter follows the primary key type of this model, so a string
  // id is neither coerced to a number nor rejected by the request validation
  const idParams = resourceModel.idModel;

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

  const resourceSchemaConfig = {
    findSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['find']),
      headers: recaptchaHeaderSchema(routeRecaptcha['find']),
      summary: `Find ${resourceName} data`,
      description: `Find ${resourceName} data`,
      response: {
        200: resourceModel.readOneModel,
        ...AllErrorResponses
      },
      params: idParams
    },
    querySchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['query']),
      headers: recaptchaHeaderSchema(routeRecaptcha['query']),
      summary: `Query ${resourceName} data`,
      description: `Query ${resourceName} data`,
      response: {
        200: createSchemaModel(queryResponse),
        ...AllErrorResponses
      },
      body: createSchemaModel(queryRequest)
    },
    aggregateSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['aggregate']),
      headers: recaptchaHeaderSchema(routeRecaptcha['aggregate']),
      summary: `Aggregate ${resourceName} data`,
      description: `Aggregate ${resourceName} data`,
      response: {
        200: createSchemaModel(aggregateResponse),
        ...AllErrorResponses
      },
      body: createSchemaModel(aggregateRequest)
    },
    createSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['create']),
      headers: recaptchaHeaderSchema(routeRecaptcha['create']),
      summary: `Create ${resourceName} data`,
      description: `Create ${resourceName} data`,
      response: {
        201: resourceModel.readOneModel,
        ...AllErrorResponses
      },
      body: resourceModel.createOneModel
    },
    updateSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['update']),
      headers: recaptchaHeaderSchema(routeRecaptcha['update']),
      summary: `Update ${resourceName} data`,
      description: `Update ${resourceName} data`,
      response: {
        200: resourceModel.readOneModel,
        ...AllErrorResponses
      },
      body: resourceModel.updateOneModel,
      params: idParams
    },
    deleteSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['delete']),
      headers: recaptchaHeaderSchema(routeRecaptcha['delete']),
      summary: `Delete ${resourceName} data`,
      description: `Delete ${resourceName} data`,
      response: {
        200: resourceModel.readOneModel,
        ...AllErrorResponses
      },
      params: idParams
    },
    exportSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['export']),
      headers: recaptchaHeaderSchema(routeRecaptcha['export']),
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
        ...AllErrorResponses
      },
      body: createSchemaModel(exportRequest)
    },
    fileUploadSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['fileUpload']),
      headers: recaptchaHeaderSchema(routeRecaptcha['fileUpload']),
      summary: `Upload ${resourceName} files`,
      description: `Upload ${resourceName} files`,
      consumes: ['multipart/form-data'],
      response: {
        200: resourceModel.filesModel,
        ...AllErrorResponses
      },
      body: resourceModel.fileUploadModel,
      params: idParams
    },
    fileDeleteSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['fileDelete']),
      headers: recaptchaHeaderSchema(routeRecaptcha['fileDelete']),
      summary: `Delete ${resourceName} files`,
      description: `Delete ${resourceName} files`,
      response: {
        200: resourceModel.filesModel,
        ...AllErrorResponses
      },
      body: resourceModel.fileDeleteModel,
      params: idParams
    }
  };

  for (const resourceConfig of Object.values(resourceSchemaConfig)) {
    resourceConfig[`x-${CONFIG_NAME}-resource`] = name;
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
 * and as the connect shape of the relation inputs pointing at the model. A
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
