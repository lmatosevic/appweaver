import { Static } from '@sinclair/typebox';
import { ResourceRoutesConfig, RouteConfig } from '@appweaver/common';
import { createSchema, Id } from '../resource';
import { injectModel, injectService } from '../context';
import { exportService } from '../export';
import { fileService } from '../storage';
import { aggregateFiles, maxFileSize } from '../utils';
import { ResourceSchema, RoutesHandler, Server } from '../types';

export function resourceRoutes(
  name: string,
  routesConfig: Omit<ResourceRoutesConfig, 'modelName'> = {}
): { handler: RoutesHandler; schema: ResourceSchema } {
  const routeConfig = (
    configName: keyof ResourceRoutesConfig
  ): RouteConfig | undefined => routesConfig[configName];

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
    const { auth, authenticateJWT } = server;

    const service = injectService(name);
    const resourceModel = injectModel(name);

    const routeAuth = (config: RouteConfig | undefined) =>
      config?.public ? undefined : auth(config?.auth ?? [authenticateJWT]);

    const hasFiles = Object.keys(resourceModel.config.files ?? {}).length > 0;

    const findConfig = routeConfig('find');
    if (!findConfig?.exclude) {
      server.get<{ Params: Static<typeof Id> }>(
        '/:id',
        {
          schema: schema.findSchema,
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
    if (!queryConfig?.exclude) {
      server.post(
        '/query',
        {
          schema: schema.querySchema,
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
    if (!aggregateConfig?.exclude) {
      server.post(
        '/aggregate',
        {
          schema: schema.aggregateSchema,
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
    if (!createConfig?.exclude) {
      server.post(
        '',
        {
          schema: schema.createSchema,
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
    if (!updateConfig?.exclude) {
      server.put<{ Params: Static<typeof Id> }>(
        '/:id',
        {
          schema: schema.updateSchema,
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
    if (!deleteConfig?.exclude) {
      server.delete<{ Params: Static<typeof Id> }>(
        '/:id',
        {
          schema: schema.deleteSchema,
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
    if (!exportConfig?.exclude) {
      server.post(
        '/export',
        {
          schema: schema.exportSchema,
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
    if (hasFiles && !fileUploadConfig?.exclude && resourceModel.config.files) {
      const config = resourceModel.config.files;
      const maxSize = maxFileSize(config);

      server.post<{ Params: Static<typeof Id> }>(
        '/:id/files',
        {
          schema: schema.fileUploadSchema,
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
            service.client
          );

          reply.status(200).send(aggregateFiles(files, config));
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
          preHandler: routeAuth(fileDeleteConfig),
          config: fileDeleteConfig
        },
        async (request, reply) => {
          const resource = await service.find(request.params.id);

          const files = await fileService.deleteFiles(
            request.body,
            resource,
            service.client
          );

          reply.status(200).send(aggregateFiles(files, config));
        }
      );
    }
  };

  return { handler, schema: schema };
}
