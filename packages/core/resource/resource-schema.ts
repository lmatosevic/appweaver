import { Type } from '@sinclair/typebox';
import {
  AnyJson,
  camelToSnakeCase,
  Id,
  ResourceRoutesConfig,
  StringDate
} from '@appweaver/common';
import { context } from '../context';
import { FileResponse } from '../storage';
import { AllErrorResponses } from '../errors';
import { ResourceSchemaConfig } from '../types';

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
  tag: string,
  publicRoutes: Array<keyof ResourceRoutesConfig> = []
): ResourceSchemaConfig {
  const resourceModel = context.models[name];

  const resourceName = camelToSnakeCase(name, ' ');

  const schemaSecurity = (routeName: keyof ResourceRoutesConfig) =>
    publicRoutes.includes(routeName) ? [] : [{ bearer: [] }];

  return {
    findSchema: {
      tags: [tag],
      security: schemaSecurity('find'),
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
      security: schemaSecurity('query'),
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
      security: schemaSecurity('aggregate'),
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
      security: schemaSecurity('create'),
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
      security: schemaSecurity('update'),
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
      security: schemaSecurity('delete'),
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
      security: schemaSecurity('export'),
      summary: `Export ${resourceName} data`,
      description: `Export ${resourceName} data`,
      response: {
        200: {
          content: {
            'text/csv': {
              schema: FileResponse
            }
          }
        },
        ...AllErrorResponses
      },
      body: Type.Pick(QueryRequestData, ['filter', 'sort'])
    },
    fileUploadSchema: {
      tags: [tag],
      security: schemaSecurity('fileUpload'),
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
      security: schemaSecurity('fileDelete'),
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
