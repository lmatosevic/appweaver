import fastifyPlugin from 'fastify-plugin';
import { TObject } from '@sinclair/typebox';
import { MODEL, objectHasProperty } from '@appweaver/common';
import { context, injectAll, injectRoutes } from '../context';
import { resourceModelProps } from '../utils';
import { Model, Server } from '../types';

export default fastifyPlugin((server: Server): void => {
  const usedSchemas = new Set<TObject>();

  for (const model of context.resource.models.values()) {
    const routeSchema = injectRoutes(model.name, false)?.schema;

    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      const modelName = `${model.name}${suffix}`;
      const modelSchema = model[property].$defs[modelName];

      // Add schema if it's referenced in the route schema
      if (routeSchema && objectHasProperty(routeSchema, '$ref', modelName)) {
        usedSchemas.add(modelSchema);
        continue;
      }

      // Add schema if it's referenced by any other model variant
      for (const def of Object.values(model[property].$defs)) {
        if (objectHasProperty((def as TObject).properties, '$ref', modelName)) {
          usedSchemas.add(modelSchema);
          break;
        }
      }
    }
  }

  // Add additional schemas for registered models
  const models = injectAll<Model>(MODEL);
  for (const model of models) {
    usedSchemas.add({ $id: model.name, ...model.schema });
  }

  // Add used schemas to the server instance
  for (const schema of usedSchemas.values()) {
    if (schema.$id && !server.getSchema(schema.$id)) {
      server.addSchema({ ...schema });
    }
  }
});
