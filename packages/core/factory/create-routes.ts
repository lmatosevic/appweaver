import path from 'node:path';
import { capitalize, ResourceRoutesConfig } from '@appweaver/common';
import { context } from '../context';
import { resourceRoutes } from '../resource';
import {
  ResourceNameSymbol,
  ResourceTypeRoutes,
  ResourceTypeSymbol
} from '../constants';
import { ResourceRoute } from '../types';

export function createRoutes(config: ResourceRoutesConfig): ResourceRoute {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  const { handler, schema } = resourceRoutes(name, config);

  const routeData = { config, schema, handler };

  routeData[ResourceNameSymbol] = name;
  routeData[ResourceTypeSymbol] = ResourceTypeRoutes;

  context.routes[name] = routeData;

  return routeData;
}
