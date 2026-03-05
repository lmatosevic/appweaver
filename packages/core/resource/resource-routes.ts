import { Static } from '@sinclair/typebox';
import {
  ResourceRoutesConfig,
  RouteCacheConfig,
  RouteConfig
} from '@appweaver/common';
import { createSchema, Id } from './resource-schema';
import { ExportService } from '../export/export-service';
import { inject, injectModel, injectService } from '../context';
import { FileService } from '../storage';
import { aggregateFiles, maxFileSize } from '../utils';
import { ResourceSchemaConfig, RoutesHandler, Server } from '../types';

type FullRouteConfig = RouteConfig & RouteCacheConfig;

export function resourceRoutes(
  name: string,
  routesConfig: Omit<ResourceRoutesConfig, 'modelName'> = {}
): { handler: RoutesHandler; schema: ResourceSchemaConfig } {
  const routeConfig = (
    configName: keyof ResourceRoutesConfig
  ): FullRouteConfig | undefined => {
    return {
      ...(routesConfig[configName] ?? {}),
      cacheModelName: ['find', 'query', 'aggregate'].includes(configName)
        ? name
        : undefined
    };
  };

  const publicRoutes = Object.keys(routesConfig)
    .map((key) => {
      const routeName = key as keyof ResourceRoutesConfig;
      const config = routeConfig(routeName);
      if (config?.public || config?.auth?.length === 0) {
        return routeName;
      } else {
        return null;
      }
    })
    .filter((v) => v !== null);

  const schema = createSchema(name, publicRoutes);

  const handler = (server: Server) => {
    const { auth, caching, authenticateJWT } = server;

    const service = injectService(name);
    const resourceModel = injectModel(name);

    const routeHandlers = (cfg: FullRouteConfig | undefined) => {
      return [
        cfg?.public ? undefined : auth(cfg?.auth ?? [authenticateJWT]),
        cfg?.cacheModelName ? caching : undefined
      ].filter((v) => v !== undefined);
    };

    const hasFiles = Object.keys(resourceModel.config.files ?? {}).length > 0;

    const findConfig = routeConfig('find');
    if (!findConfig?.exclude) {
      server.get<{ Params: Static<typeof Id> }>(
        '/:id',
        {
          schema: schema.findSchema,
          preHandler: routeHandlers(findConfig),
          config: findConfig
        },
        async (request, reply) => {
          const response = await service.find(request.params.id);

          return reply.status(200).send(response);
        }
      );
    }

    const queryConfig = routeConfig('query');
    if (!queryConfig?.exclude) {
      server.post(
        '/query',
        {
          schema: schema.querySchema,
          preHandler: routeHandlers(queryConfig),
          config: queryConfig
        },
        async (request, reply) => {
          const { page, size, sort, ...body } = request.body as any;
          const response = await service.query(body.filter, page, size, sort);

          return reply.status(200).send(response);
        }
      );
    }

    const aggregateConfig = routeConfig('aggregate');
    if (!aggregateConfig?.exclude) {
      server.post(
        '/aggregate',
        {
          schema: schema.aggregateSchema,
          preHandler: routeHandlers(aggregateConfig),
          config: aggregateConfig
        },
        async (request, reply) => {
          const { dateField, from, to, step, safeIncrement, ...body } =
            request.body as any;
          const response = await service.aggregate(
            body.filter,
            body.select,
            dateField,
            from,
            to,
            step,
            safeIncrement
          );

          return reply.status(200).send(response);
        }
      );
    }

    const createConfig = routeConfig('create');
    if (!createConfig?.exclude) {
      server.post(
        '',
        {
          schema: schema.createSchema,
          preHandler: routeHandlers(createConfig),
          config: createConfig
        },
        async (request, reply) => {
          const response = await service.create(request.body as any);

          return reply.status(201).send(response);
        }
      );
    }

    const updateConfig = routeConfig('update');
    if (!updateConfig?.exclude) {
      server.put<{ Params: Static<typeof Id> }>(
        '/:id',
        {
          schema: schema.updateSchema,
          preHandler: routeHandlers(updateConfig),
          config: updateConfig
        },
        async (request, reply) => {
          const response = await service.update(
            request.params.id,
            request.body as any
          );

          return reply.status(200).send(response);
        }
      );
    }

    const deleteConfig = routeConfig('delete');
    if (!deleteConfig?.exclude) {
      server.delete<{ Params: Static<typeof Id> }>(
        '/:id',
        {
          schema: schema.deleteSchema,
          preHandler: routeHandlers(deleteConfig),
          config: deleteConfig
        },
        async (request, reply) => {
          const response = await service.delete(request.params.id);

          return reply.status(200).send(response);
        }
      );
    }

    const exportConfig = routeConfig('export');
    if (!exportConfig?.exclude) {
      server.post(
        '/export',
        {
          schema: schema.exportSchema,
          preHandler: routeHandlers(exportConfig),
          config: exportConfig
        },
        async (request, reply) => {
          const { sort, ...body } = request.body as any;
          const response = await inject(ExportService).exportCsv(
            service,
            body.filter,
            sort
          );

          return reply
            .status(200)
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

      server.post<{ Params: Static<typeof Id> }>(
        '/:id/files',
        {
          schema: schema.fileUploadSchema,
          preHandler: routeHandlers(fileUploadConfig),
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

          return reply.status(200).send(aggregateFiles(files, config));
        }
      );
    }

    const fileDeleteConfig = routeConfig('fileDelete');
    if (hasFiles && !fileDeleteConfig?.exclude && resourceModel.config.files) {
      const config = resourceModel.config.files;

      server.post<{
        Params: Static<typeof Id>;
        Body: Record<string, string | string[]>;
      }>(
        '/:id/delete-files',
        {
          schema: schema.fileDeleteSchema,
          preHandler: routeHandlers(fileDeleteConfig),
          config: fileDeleteConfig
        },
        async (request, reply) => {
          const resource = await service.find(request.params.id);

          const files = await inject(FileService).deleteFiles(
            request.body,
            resource,
            service.client
          );

          return reply.status(200).send(aggregateFiles(files, config));
        }
      );
    }
  };

  return { handler, schema: schema };
}
