import { Type } from '@sinclair/typebox';
import { camelToSnakeCase } from '@appweaver/common';
import { CommonId } from './common-schema';
import { relationInputModels, relationOutputModels } from './relation-schema';
import { fileInputModels, FileResponse } from '../storage';
import { AllErrorResponses } from '../errors';
import { context } from '../context';
import { ResourceNameSymbol } from '../constants';
import { StringDate } from '../utils';
import {
  ResourceConfig,
  ResourceModelConfig,
  ResourceRoutesConfig,
  ResourceSchemaConfig
} from '../types';

export const QueryRequestData = Type.Object({
  filter: Type.Optional(Type.Any({ examples: [{ field: 'value' }] })),
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
  filter: Type.Optional(Type.Any({ examples: [{ field: 'value' }] })),
  select: Type.Optional(Type.Any({ examples: [{ field: 'value' }] })),
  dateField: Type.Optional(Type.String({ examples: ['createdAt'] })),
  from: Type.Optional(StringDate({ examples: ['2025-04-11T11:27:58.590Z'] })),
  to: Type.Optional(StringDate({ examples: ['2025-04-11T11:27:58.590Z'] })),
  step: Type.Optional(Type.Integer({ minimum: 1, examples: [3600] })),
  safeIncrement: Type.Optional(Type.Boolean({ examples: [true] }))
});

export const AggregateResponseData = Type.Optional(
  Type.Any({ examples: [{ field: 'value' }] })
);

export function resourceConfig<
  Model = any,
  Relations = unknown,
  Files = unknown
>(
  name: string,
  modelConfig: ResourceModelConfig<Model, Relations, Files>
): ResourceConfig<Model, Relations, Files> {
  const { readOneModel, readManyModel } = relationOutputModels(modelConfig);
  const { createOneModel, updateOneModel } = relationInputModels(modelConfig);
  const { fileUploadModel, fileDeleteModel } = fileInputModels(
    modelConfig.fileConfig ?? {}
  );

  const config: ResourceConfig<Model, Relations, Files> = {
    ...modelConfig,
    readOneModel,
    readManyModel,
    createOneModel,
    updateOneModel,
    fileUploadModel,
    fileDeleteModel
  };

  for (const value of Object.values(config)) {
    if (value) {
      value[ResourceNameSymbol] = name;
    }
  }

  config[ResourceNameSymbol] = name;
  context.resources[name] = config;

  return config;
}

export function createSchema(
  name: string,
  tag: string,
  publicRoutes: Array<keyof ResourceRoutesConfig> = []
): ResourceSchemaConfig {
  const resourceConfig = context.resources[name];

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
        200: resourceConfig.readOneModel,
        ...AllErrorResponses
      },
      params: CommonId
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
            items: Type.Array(resourceConfig.readManyModel ?? Type.Object({}))
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
        201: resourceConfig.readOneModel,
        ...AllErrorResponses
      },
      body: resourceConfig.createOneModel
    },
    updateSchema: {
      tags: [tag],
      security: schemaSecurity('update'),
      summary: `Update ${resourceName} data`,
      description: `Update ${resourceName} data`,
      response: {
        200: resourceConfig.readOneModel,
        ...AllErrorResponses
      },
      body: resourceConfig.updateOneModel,
      params: CommonId
    },
    deleteSchema: {
      tags: [tag],
      security: schemaSecurity('delete'),
      summary: `Delete ${resourceName} data`,
      description: `Delete ${resourceName} data`,
      response: {
        200: resourceConfig.readOneModel,
        ...AllErrorResponses
      },
      params: CommonId
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
        200: resourceConfig.fileModel,
        ...AllErrorResponses
      },
      body: resourceConfig.fileUploadModel,
      params: CommonId
    },
    fileDeleteSchema: {
      tags: [tag],
      security: schemaSecurity('fileDelete'),
      summary: `Delete ${resourceName} files`,
      description: `Delete ${resourceName} files`,
      response: {
        200: resourceConfig.fileModel,
        ...AllErrorResponses
      },
      body: resourceConfig.fileDeleteModel,
      params: CommonId
    }
  };
}
