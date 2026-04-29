import path from 'node:path';
import {
  camelToSnakeCase,
  capitalize,
  logger,
  plural,
  RESOURCE_NAME,
  RESOURCE_ROUTES_TYPE,
  RESOURCE_TYPE,
  ResourceRoutes,
  ResourceRoutesConfig
} from '@appweaver/common';
import { define } from '../context';
import { resourceRoutes } from '../resource';

export function createRoutes(
  config: ResourceRoutesConfig,
  override: boolean = false
): ResourceRoutes {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  const basePath =
    config.path || camelToSnakeCase(plural(name), '-').toLowerCase();

  const handler = resourceRoutes(name, config);

  const routeData: ResourceRoutes = { config, basePath, handler };

  routeData[RESOURCE_NAME] = name;
  routeData[RESOURCE_TYPE] = RESOURCE_ROUTES_TYPE;

  logger.debug({ modelName: config.modelName }, 'Created resource routes');

  define(routeData, undefined, override ? 'override' : undefined);

  return routeData;
}
