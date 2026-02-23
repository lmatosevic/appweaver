import path from 'node:path';
import { capitalize, ResourceRoutesConfig } from '@appweaver/common';
import { define } from '../context';
import { resourceRoutes } from '../resource';
import { ResourceRoutes } from '../types';
import {
  RESOURCE_NAME,
  RESOURCE_ROUTES_TYPE,
  RESOURCE_TYPE
} from '../constants';

export function createRoutes(config: ResourceRoutesConfig): ResourceRoutes {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  const { handler, schema } = resourceRoutes(name, config);

  const routeData = { config, schema, handler };

  routeData[RESOURCE_NAME] = name;
  routeData[RESOURCE_TYPE] = RESOURCE_ROUTES_TYPE;

  define(routeData);

  return routeData;
}
