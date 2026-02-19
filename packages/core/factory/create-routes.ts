import path from 'node:path';
import { capitalize, ResourceRoutesConfig } from '@appweaver/common';
import { context } from '../context';
import { resourceRoutes } from '../resource';
import { ResourceSchema, RouteHandler } from '../types';

export function createRoutes(config: ResourceRoutesConfig): {
  config: ResourceRoutesConfig;
  schema: ResourceSchema;
  handler: RouteHandler;
} {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  const { handler, schema } = resourceRoutes(name, config);

  const routeData = { config, schema, handler };

  context.routes[name] = routeData;

  return routeData;
}
