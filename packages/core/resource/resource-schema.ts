import { Type } from '@sinclair/typebox';
import {
  AnyJson,
  AuthType,
  camelToSnakeCase,
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

export const Id = Type.Object({
  id: Type.Integer({ minimum: 1 })
});

export const IdString = Type.Object({
  id: Type.String({ maxLength: 36 })
});

export const AuditData = Type.Object({
  updatedAt: StringDate(),
  createdAt: StringDate(),
  createdById: Nullable(Type.Integer({ minimum: 1, example: 1 }))
});

export const QueryRequestData = Type.Object({
  filter: Type.Optional(AnyJson({ example: { field: 'value' } })),
  page: Type.Optional(Type.Number({ minimum: 1, example: 1 })),
  size: Type.Optional(Type.Number({ minimum: 0, maximum: 1000, example: 50 })),
  sort: Type.Optional(Type.String({ example: '-createdAt,id' }))
});

export const QueryResponseData = Type.Object({
  resultCount: Type.Number({ example: 10 }),
  totalCount: Type.Number({ example: 100 })
});

export const AggregateRequestData = Type.Object({
  filter: Type.Optional(AnyJson({ example: { field: 'value' } })),
  select: Type.Optional(AnyJson({ example: { field: 'value' } })),
  dateField: Type.Optional(Type.String({ example: 'createdAt' })),
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

  const queryRequest = Type.Composite([QueryRequestData], {
    $id: `${name}QueryRequest`
  });

  const queryResponse = Type.Composite(
    [
      QueryResponseData,
      Type.Object({
        items: Type.Array(resourceModel.readManyModel)
      })
    ],
    { $id: `${name}QueryResponse` }
  );

  const aggregateRequest = Type.Composite([AggregateRequestData], {
    $id: `${name}AggregateRequest`
  });

  const aggregateResponse = Type.Composite([AggregateResponseData], {
    $id: `${name}AggregateResponse`
  });

  const exportRequest = Type.Composite(
    [Type.Pick(QueryRequestData, ['filter', 'sort'])],
    { $id: `${name}ExportRequest` }
  );

  return {
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
      params: Id
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
      params: Id
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
      params: Id
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
      params: Id
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
      params: Id
    }
  };
}
