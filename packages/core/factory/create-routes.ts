import path from 'node:path';
import { capitalize, ResourceRoutesConfig } from '@appweaver/common';
import { context } from '../context';
import { resourceRoutes } from '../resource';
import { RouteHandler } from '../types';

export function createRoutes(config: ResourceRoutesConfig): RouteHandler {
  const name = capitalize(
    config.name || path.basename(path.dirname(__dirname))
  );

  const resourceRoute = resourceRoutes(name, config);

  context.routes[name] = { config, handler: resourceRoute };

  return resourceRoute;
}
