import { Type } from '@sinclair/typebox';
import {
  AnyJson,
  AuthType,
  camelToSnakeCase,
  Nullable,
  plural,
  RecaptchaConfig,
  ResourceRoutesConfig,
  StringDate
} from '@appweaver/common';
import { injectModel } from '../context';
import { authSchema, recaptchaHeaderSchema } from '../security';
import { AllErrorResponses } from '../errors';
import { ResourceSchemaConfig } from '../types';

export const Id = Type.Object({
  id: Type.Integer({ minimum: 1 })
});

export const IdString = Type.Object({
  id: Type.String({ maxLength: 36 })
});

export const AuditData = Type.Object({
  updatedAt: StringDate(),
  createdAt: StringDate(),
  createdById: Nullable(Type.Integer({ minimum: 1, examples: [1] }))
});

export const QueryRequestData = Type.Object({
  filter: Type.Optional(AnyJson({ examples: [{ field: 'value' }] })),
  page: Type.Optional(Type.Number({ minimum: 1, examples: [1] })),
  size: Type.Optional(
    Type.Number({ minimum: 0, maximum: 1000, examples: [50] })
  ),
  sort: Type.Optional(Type.String({ examples: ['-createdAt,id'] }))
});

export const QueryResponseData = Type.Object({
  resultCount: Type.Number({ examples: [10] }),
  totalCount: Type.Number({ examples: [100] })
});

export const AggregateRequestData = Type.Object({
  filter: Type.Optional(AnyJson({ examples: [{ field: 'value' }] })),
  select: Type.Optional(AnyJson({ examples: [{ field: 'value' }] })),
  dateField: Type.Optional(Type.String({ examples: ['createdAt'] })),
  from: Type.Optional(StringDate()),
  to: Type.Optional(StringDate()),
  step: Type.Optional(Type.Integer({ minimum: 1, examples: [3600] })),
  safeIncrement: Type.Optional(Type.Boolean({ examples: [true] }))
});

export const AggregateResponseData = Type.Optional(
  AnyJson({ examples: [{ field: 'value' }] })
);

export function createSchema(
  name: string,
  routeAuthTypes: Record<keyof ResourceRoutesConfig, AuthType[] | undefined>,
  routeRecaptcha: Record<keyof ResourceRoutesConfig, RecaptchaConfig>
): ResourceSchemaConfig {
  const resourceModel = injectModel(name);

  const resourceName = camelToSnakeCase(name, ' ');
  const tag = plural(name);

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
        200: Type.Composite([
          QueryResponseData,
          Type.Object({
            items: Type.Array(resourceModel.readManyModel)
          })
        ]),
        ...AllErrorResponses
      },
      body: QueryRequestData
    },
    aggregateSchema: {
      tags: [tag],
      security: authSchema(routeAuthTypes['aggregate']),
      headers: recaptchaHeaderSchema(routeRecaptcha['aggregate']),
      summary: `Aggregate ${resourceName} data`,
      description: `Aggregate ${resourceName} data`,
      response: {
        200: AggregateResponseData,
        ...AllErrorResponses
      },
      body: AggregateRequestData
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
      body: Type.Pick(QueryRequestData, ['filter', 'sort'])
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
