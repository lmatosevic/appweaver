import { Static } from '@sinclair/typebox';
import { plural } from '@appweaver/common';
import { CommonId, createSchema } from '../resource';
import { context } from '../context';
import { exportService } from '../export';
import { fileService } from '../storage';
import { aggregateFiles, maxFileSize } from '../utils';
import {
  FileConfigProps,
  ResourceRoutesConfig,
  RouteConfig,
  RouteHandler,
  ServerInstance
} from '../types';

export function resourceRoutes(
  name: string,
  routesConfig: ResourceRoutesConfig = {}
): RouteHandler {
  const route = (server: ServerInstance) => {
    const { auth, authenticateJWT } = server;

    const service = context.services[name];
    const resourceConfig = context.resources[name];

    const routeConfig = (
      configName: keyof ResourceRoutesConfig
    ): RouteConfig | undefined =>
      routesConfig[configName] || routesConfig.default;

    const routeAuth = (config: RouteConfig | undefined) =>
      config?.public ? undefined : auth(config?.auth ?? [authenticateJWT]);

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

    const resourceName = service.model.name;
    const resourceNamePlural = plural(resourceName);
    const resourceSchema = createSchema(
      resourceName,
      resourceNamePlural,
      publicRoutes
    );

    const hasFiles =
      Object.keys(resourceConfig.fileModel?.properties ?? {}).length > 0;

    const findConfig = routeConfig('find');
    if (!findConfig?.exclude && resourceSchema.findSchema) {
      server.get<{ Params: Static<typeof CommonId> }>(
        '/:id',
        {
          schema: resourceSchema.findSchema,
          preHandler: routeAuth(findConfig),
          config: findConfig
        },
        async (request, reply) => {
          const response = await service.find(request.params.id);

          reply.status(200).send(response);
        }
      );
    }

    const queryConfig = routeConfig('query');
    if (!queryConfig?.exclude && resourceSchema.querySchema) {
      server.post(
        '/query',
        {
          schema: resourceSchema.querySchema,
          preHandler: routeAuth(queryConfig),
          config: queryConfig
        },
        async (request, reply) => {
          const { page, size, sort, ...body } = request.body as any;
          const response = await service.query(body.filter, page, size, sort);

          reply.status(200).send(response);
        }
      );
    }

    const aggregateConfig = routeConfig('aggregate');
    if (!aggregateConfig?.exclude && resourceSchema.aggregateSchema) {
      server.post(
        '/aggregate',
        {
          schema: resourceSchema.aggregateSchema,
          preHandler: routeAuth(aggregateConfig),
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

          reply.status(200).send(response);
        }
      );
    }

    const createConfig = routeConfig('create');
    if (!createConfig?.exclude && resourceSchema.createSchema) {
      server.post(
        '',
        {
          schema: resourceSchema.createSchema,
          preHandler: routeAuth(createConfig),
          config: createConfig
        },
        async (request, reply) => {
          const response = await service.create(request.body as any);

          reply.status(201).send(response);
        }
      );
    }

    const updateConfig = routeConfig('update');
    if (!updateConfig?.exclude && resourceSchema.updateSchema) {
      server.put<{ Params: Static<typeof CommonId> }>(
        '/:id',
        {
          schema: resourceSchema.updateSchema,
          preHandler: routeAuth(updateConfig),
          config: updateConfig
        },
        async (request, reply) => {
          const response = await service.update(
            request.params.id,
            request.body as any
          );

          reply.status(200).send(response);
        }
      );
    }

    const deleteConfig = routeConfig('delete');
    if (!deleteConfig?.exclude && resourceSchema.deleteSchema) {
      server.delete<{ Params: Static<typeof CommonId> }>(
        '/:id',
        {
          schema: resourceSchema.deleteSchema,
          preHandler: routeAuth(deleteConfig),
          config: deleteConfig
        },
        async (request, reply) => {
          const response = await service.delete(request.params.id);

          reply.status(200).send(response);
        }
      );
    }

    const exportConfig = routeConfig('export');
    if (!exportConfig?.exclude && resourceSchema.exportSchema) {
      server.post(
        '/export',
        {
          schema: resourceSchema.exportSchema,
          preHandler: routeAuth(exportConfig),
          config: exportConfig
        },
        async (request, reply) => {
          const { sort, ...body } = request.body as any;
          const response = await exportService.exportCsv(
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
    if (
      hasFiles &&
      !fileUploadConfig?.exclude &&
      resourceSchema.fileUploadSchema &&
      resourceConfig.fileConfig
    ) {
      const config = resourceConfig.fileConfig as FileConfigProps;
      const maxSize = maxFileSize(config);

      server.post<{ Params: Static<typeof CommonId> }>(
        '/:id/files',
        {
          schema: resourceSchema.fileUploadSchema,
          preHandler: routeAuth(fileUploadConfig),
          config: fileUploadConfig,
          attachValidation: true // Disable validation because of a multipart body.
        },
        async (request, reply) => {
          const resource = await service.find(request.params.id);

          const parts = request.parts({ limits: { fileSize: maxSize } });

          const files = await fileService.saveFiles(
            parts,
            resource,
            service.model
          );

          reply.status(200).send(aggregateFiles(files, config));
        }
      );
    }

    const fileDeleteConfig = routeConfig('fileDelete');
    if (
      hasFiles &&
      !fileDeleteConfig?.exclude &&
      resourceSchema.fileDeleteSchema &&
      resourceConfig.fileConfig
    ) {
      const config = resourceConfig.fileConfig as FileConfigProps;

      server.post<{
        Params: Static<typeof CommonId>;
        Body: Record<string, string | string[]>;
      }>(
        '/:id/delete-files',
        {
          schema: resourceSchema.fileDeleteSchema,
          preHandler: routeAuth(fileDeleteConfig),
          config: fileDeleteConfig
        },
        async (request, reply) => {
          const resource = await service.find(request.params.id);

          const files = await fileService.deleteFiles(
            request.body,
            resource,
            service.model
          );

          reply.status(200).send(aggregateFiles(files, config));
        }
      );
    }
  };
  context.routes[name] = route;
  return route;
}
