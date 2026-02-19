import path from 'node:path';
import { capitalize, ResourceRoutesConfig } from '@appweaver/common';
import { context } from '../context';
import { resourceRoutes } from '../resource';
import { RouteHandler } from '../types';

export function createRoutes(config: ResourceRoutesConfig): {
  config: ResourceRoutesConfig;
  handler: RouteHandler;
} {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  const routes = resourceRoutes(name, config);

  const routeData = { config, handler: routes };

  context.routes[name] = routeData;

  return routeData;
}
