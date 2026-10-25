import {
  camelToSnakeCase,
  capitalize,
  createLogger,
  plural,
  RESOURCE_NAME,
  RESOURCE_ROUTES_TYPE,
  RESOURCE_TYPE,
  ResourceRoutes,
  ResourceRoutesConfig
} from '@appweaver/common';
import { define } from '@appweaver/core';
import { resourceRoutes } from '../resource/resource-routes';

const logger = createLogger('resource');

/**
 * Creates the resource routes of a model and defines them in the application context. The base path defaults to the
 * plural kebab case of the model name.
 *
 * @param {ResourceRoutesConfig} config - The routes configuration with the model name.
 * @param {boolean} [override=false] - Whether to replace routes already defined for the model.
 * @return {ResourceRoutes} The created resource routes.
 */
export function createRoutes(
  config: ResourceRoutesConfig,
  override: boolean = false
): ResourceRoutes {
  const name = capitalize(config.modelName);

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
