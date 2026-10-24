import {
  AggregateOptions,
  AuthType,
  BulkItem,
  BulkResponse,
  CaptchaConfig,
  QueryOptions,
  ResourceId,
  QueryRouteConfig,
  ResourceRoutesConfig,
  RouteCacheConfig,
  RouteConfig
} from '@appweaver/common';
import {
  resourceConfig,
  FileService,
  ExportService,
  aggregateFiles,
  maxFileSize
} from '@appweaver/data';
import { createSchema } from './resource-schema';
import { parseJsonParams, queryRouteMethods } from './utils/query-params-util';
import {
  resolveRouteConfig,
  ResourceRouteName
} from './utils/route-config-util';
import { inject, injectModel, injectService } from '@appweaver/core';
import { Server } from '../types/server';

type FullRouteConfig = RouteConfig &
  RouteCacheConfig &
  Pick<QueryRouteConfig, 'method'> & {
    resourceRouteName: ResourceRouteName;
    maxItems?: number;
    returnRecords?: boolean;
  };

/** The `:id` path parameter, validated against the primary key schema of the
 * resource, so it arrives typed after the model id */
type IdParams = { id: ResourceId };

/**
 * Creates the plugin registering the CRUD, query, aggregate, export, file, and bulk routes of a model, skipping the
 * excluded ones.
 *
 * @param {string} name - The model name.
 * @param {Object} [routesConfig={}] - The config of each route.
 * @return {Function} The plugin registering the routes.
 */
export function resourceRoutes(
  name: string,
  routesConfig: Omit<ResourceRoutesConfig, 'modelName' | 'path'> = {}
): (server: Server) => void {
  const routeConfig = (
    configName: ResourceRouteName
  ): FullRouteConfig | undefined => ({
    ...resolveRouteConfig(configName, routesConfig),
    resourceRouteName: configName,
    cacheModelName: ['find', 'query', 'aggregate'].includes(configName)
      ? name
      : undefined
  });

  const routeNames: ResourceRouteName[] = [
    'find',
    'query',
    'aggregate',
    'create',
    'update',
    'replace',
    'delete',
    'export',
    'fileUpload',
    'fileDelete',
    'bulkCreate',
    'bulkUpdate',
    'bulkReplace',
    'bulkDelete'
  ];

  const routeAuthTypes = routeNames.reduce<
    Record<ResourceRouteName, AuthType[] | undefined>
  >((acc, routeName) => {
    const config = routeConfig(routeName);
    if (config?.public || config?.auth?.length === 0) {
      acc[routeName] = [];
    } else if (config?.auth && config.auth.length > 0) {
      acc[routeName] = config.auth as AuthType[];
    } else {
      acc[routeName] = undefined;
    }
    return acc;
  }, {} as any);

  const routeCaptcha = routeNames.reduce<
    Record<ResourceRouteName, CaptchaConfig>
  >((acc, routeName) => {
    const config = routeConfig(routeName);
    acc[routeName] = {
      recaptcha: config?.recaptcha,
      recaptchaAction: config?.recaptchaAction,
      turnstile: config?.turnstile,
      turnstileAction: config?.turnstileAction
    };
    return acc;
  }, {} as any);

  return (server: Server) => {
    const { authenticate, recaptcha, turnstile } = server;

    const schema = createSchema(name, routeAuthTypes, routeCaptcha, {
      bulkCreate: routeConfig('bulkCreate'),
      bulkUpdate: routeConfig('bulkUpdate'),
      bulkReplace: routeConfig('bulkReplace'),
      bulkDelete: routeConfig('bulkDelete')
    });

    const service = injectService(name);
    const resourceModel = injectModel(name);

    const routeAuth = (config: RouteConfig | undefined) =>
      [
        config?.public ? undefined : authenticate(config?.auth as AuthType[]),
        config?.recaptcha || config?.recaptchaAction ? recaptcha : undefined,
        config?.turnstile || config?.turnstileAction ? turnstile : undefined
      ].filter((v) => v !== undefined);

    const hasFiles = Object.keys(resourceModel.config.files ?? {}).length > 0;

    const findConfig = routeConfig('find');
    if (!findConfig?.exclude) {
      server.get<{ Params: IdParams }>(
        '/:id',
        {
          schema: schema.findSchema,
          onRequest: routeAuth(findConfig),
          config: findConfig
        },
        async (request, reply) => {
          const response = await service.find(request.params.id);

          return reply.send(response);
        }
      );
    }

    const queryConfig = routeConfig('query');
    const queryMethods = queryRouteMethods('query', queryConfig?.method);
    if (!queryConfig?.exclude && queryMethods.post) {
      server.post(
        '/query',
        {
          schema: schema.querySchema,
          onRequest: routeAuth(queryConfig),
          config: queryConfig
        },
        async (request, reply) => {
          // The body holds the query options: filter, paging, and sort
          const response = await service.query(request.body as QueryOptions);

          return reply.send(response);
        }
      );
    }

    if (!queryConfig?.exclude && queryMethods.get) {
      server.get<{ Querystring: Record<string, unknown> }>(
        '/query',
        {
          schema: schema.queryGetSchema,
          onRequest: routeAuth(queryConfig),
          preValidation: async (request) =>
            parseJsonParams(request.query, ['filter'], ['sort']),
          config: queryConfig
        },
        async (request, reply) => {
          const response = await service.query(request.query);

          return reply.send(response);
        }
      );
    }

    const aggregateConfig = routeConfig('aggregate');
    const aggregateMethods = queryRouteMethods(
      'aggregate',
      aggregateConfig?.method
    );
    if (!aggregateConfig?.exclude && aggregateMethods.post) {
      server.post(
        '/aggregate',
        {
          schema: schema.aggregateSchema,
          onRequest: routeAuth(aggregateConfig),
          config: aggregateConfig
        },
        async (request, reply) => {
          // The body holds the aggregation options: select, filter, and range
          const response = await service.aggregate(
            request.body as AggregateOptions
          );

          return reply.send(response);
        }
      );
    }

    if (!aggregateConfig?.exclude && aggregateMethods.get) {
      server.get<{ Querystring: Record<string, unknown> }>(
        '/aggregate',
        {
          schema: schema.aggregateGetSchema,
          onRequest: routeAuth(aggregateConfig),
          preValidation: async (request) =>
            parseJsonParams(request.query, ['filter', 'select']),
          config: aggregateConfig
        },
        async (request, reply) => {
          const response = await service.aggregate(
            request.query as unknown as AggregateOptions
          );

          return reply.send(response);
        }
      );
    }

    const createConfig = routeConfig('create');
    if (!createConfig?.exclude) {
      server.post(
        '',
        {
          schema: schema.createSchema,
          onRequest: routeAuth(createConfig),
          config: createConfig
        },
        async (request, reply) => {
          const response = await service.create(request.body as any);

          return reply.status(201).send(response);
        }
      );
    }

    // PATCH updates the given fields, while PUT replaces the whole resource,
    // its config inheriting the update one
    const updateConfig = routeConfig('update');
    if (!updateConfig?.exclude) {
      server.patch<{ Params: IdParams }>(
        '/:id',
        {
          schema: schema.updateSchema,
          onRequest: routeAuth(updateConfig),
          config: updateConfig
        },
        async (request, reply) => {
          const response = await service.update(
            request.params.id,
            request.body as any
          );

          return reply.send(response);
        }
      );
    }

    const replaceConfig = routeConfig('replace');
    if (!replaceConfig?.exclude) {
      server.put<{ Params: IdParams }>(
        '/:id',
        {
          schema: schema.replaceSchema,
          onRequest: routeAuth(replaceConfig),
          config: replaceConfig
        },
        async (request, reply) => {
          const response = await service.replace(
            request.params.id,
            request.body as any
          );

          return reply.send(response);
        }
      );
    }

    const deleteConfig = routeConfig('delete');
    if (!deleteConfig?.exclude) {
      server.delete<{ Params: IdParams }>(
        '/:id',
        {
          schema: schema.deleteSchema,
          onRequest: routeAuth(deleteConfig),
          config: deleteConfig
        },
        async (request, reply) => {
          const response = await service.delete(request.params.id);

          return reply.send(response);
        }
      );
    }

    const exportConfig = routeConfig('export');
    if (!exportConfig?.exclude) {
      server.post(
        '/export',
        {
          schema: schema.exportSchema,
          onRequest: routeAuth(exportConfig),
          config: exportConfig
        },
        async (request, reply) => {
          const { sort, ...body } = request.body as any;
          const response = await inject(ExportService).exportCsv(
            name,
            body.filter,
            sort
          );

          return reply
            .type(response.mimeType)
            .header(
              'Content-Disposition',
              `attachment; filename="${response.fileName}"`
            )
            .send(response.stream);
        }
      );
    }

    const fileUploadConfig = routeConfig('fileUpload');
    if (hasFiles && !fileUploadConfig?.exclude && resourceModel.config.files) {
      const config = resourceModel.config.files;
      const maxSize = maxFileSize(config);

      server.post<{ Params: IdParams }>(
        '/:id/files',
        {
          schema: schema.fileUploadSchema,
          onRequest: routeAuth(fileUploadConfig),
          config: fileUploadConfig,
          attachValidation: true // Disable validation because of a multipart body.
        },
        async (request, reply) => {
          const resource = await service.find(request.params.id);

          const parts = request.parts({ limits: { fileSize: maxSize } });

          const files = await inject(FileService).saveFiles(
            parts,
            resource,
            service.client
          );

          return reply.send(aggregateFiles(files, config));
        }
      );
    }

    const fileDeleteConfig = routeConfig('fileDelete');
    if (hasFiles && !fileDeleteConfig?.exclude && resourceModel.config.files) {
      const config = resourceModel.config.files;

      server.post<{
        Params: IdParams;
        Body: Record<string, string | string[]>;
      }>(
        '/:id/delete-files',
        {
          schema: schema.fileDeleteSchema,
          onRequest: routeAuth(fileDeleteConfig),
          config: fileDeleteConfig
        },
        async (request, reply) => {
          const resource = await service.find(request.params.id);

          const files = await inject(FileService).deleteFiles(
            request.body,
            resource,
            service.client
          );

          return reply.send(aggregateFiles(files, config));
        }
      );
    }

    // Every item of a bulk request is applied in a single transaction, or none,
    // so a response without the records only counts the items
    const bulkResponse = (
      bulkConfig: FullRouteConfig | undefined,
      records: unknown[],
      count = records.length
    ): unknown[] | BulkResponse =>
      (bulkConfig?.returnRecords ?? resourceConfig.BULK_RETURN_RECORDS)
        ? records
        : { success: true, count };

    const bulkCreateConfig = routeConfig('bulkCreate');
    if (!bulkCreateConfig?.exclude) {
      server.post<{ Body: any[] }>(
        '/bulk',
        {
          schema: schema.bulkCreateSchema,
          onRequest: routeAuth(bulkCreateConfig),
          config: bulkCreateConfig
        },
        async (request, reply) => {
          const records = await service.bulkCreate(request.body);

          return reply
            .status(201)
            .send(bulkResponse(bulkCreateConfig, records));
        }
      );
    }

    const bulkUpdateConfig = routeConfig('bulkUpdate');
    if (!bulkUpdateConfig?.exclude) {
      server.patch<{ Body: BulkItem<any>[] }>(
        '/bulk',
        {
          schema: schema.bulkUpdateSchema,
          onRequest: routeAuth(bulkUpdateConfig),
          config: bulkUpdateConfig
        },
        async (request, reply) => {
          const records = await service.bulkUpdate(request.body);

          return reply.send(bulkResponse(bulkUpdateConfig, records));
        }
      );
    }

    const bulkReplaceConfig = routeConfig('bulkReplace');
    if (!bulkReplaceConfig?.exclude) {
      server.put<{ Body: BulkItem<any>[] }>(
        '/bulk',
        {
          schema: schema.bulkReplaceSchema,
          onRequest: routeAuth(bulkReplaceConfig),
          config: bulkReplaceConfig
        },
        async (request, reply) => {
          const records = await service.bulkReplace(request.body);

          return reply.send(bulkResponse(bulkReplaceConfig, records));
        }
      );
    }

    const bulkDeleteConfig = routeConfig('bulkDelete');
    if (!bulkDeleteConfig?.exclude) {
      server.delete<{ Body: ResourceId[] }>(
        '/bulk',
        {
          schema: schema.bulkDeleteSchema,
          onRequest: routeAuth(bulkDeleteConfig),
          config: bulkDeleteConfig
        },
        async (request, reply) => {
          // The ids an earlier cascade removed are left out of the records,
          // while the count includes them as deleted
          const records = await service.bulkDelete(request.body);

          return reply.send(
            bulkResponse(bulkDeleteConfig, records, request.body.length)
          );
        }
      );
    }
  };
}
