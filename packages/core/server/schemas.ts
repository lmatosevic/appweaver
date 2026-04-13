import fastifyPlugin from 'fastify-plugin';
import { TObject } from '@sinclair/typebox';
import { MODEL, Model, resourceModelProps } from '@appweaver/common';
import { context, injectAll } from '../context';
import { Server } from '../types';

export default fastifyPlugin((server: Server) => {
  const usedSchemas = new Set<TObject>();

  // Add all resource models schemas
  for (const model of context.resource.models.values()) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      const modelName = `${model.name}${suffix}`;
      const modelSchema = model[property].$defs[modelName];
      usedSchemas.add(modelSchema);
    }
  }

  // Add additional schemas for registered models
  const models = injectAll<Model>(MODEL);
  for (const model of models) {
    usedSchemas.add({ ...model.schema, $id: model.name });
  }

  // Add used schemas to the server instance
  for (const schema of usedSchemas.values()) {
    if (schema.$id && !server.getSchema(schema.$id)) {
      server.addSchema({ ...schema });
    }
  }
});
