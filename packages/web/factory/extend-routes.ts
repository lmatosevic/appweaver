import {
  callerSource,
  capitalize,
  ModelName,
  RESOURCE_NAME,
  RESOURCE_TYPE,
  ResourceRoutesConfig
} from '@appweaver/common';
import {
  context,
  registerExtension,
  resourceExtensions
} from '@appweaver/core/internal';
import { createRoutes } from './create-routes';

type RoutesExtension = Partial<Omit<ResourceRoutesConfig, 'modelName'>>;

/**
 * Extends the routes of a model defined elsewhere, i.e. the routes of a framework or module model, once every route
 * is loaded: the `defaults` and the config of each route are merged option by option over its own, the `path`, `mcp`
 * and `events` replaced. Without routes, the model gets the routes of the extension, as with `createRoutes`.
 *
 * @example
 * export default extendRoutes('ApiKey', { defaults: { roles: ['Admin', 'User'] } });
 *
 * @param {string} modelName - The name of the model whose routes to extend.
 * @param {Object} config - The config merged over the routes.
 * @return {Object} The mark of the extension, which the route loader leaves out of the routes.
 */
export function extendRoutes(
  modelName: ModelName,
  config: RoutesExtension
): {
  [RESOURCE_NAME]: string;
  [RESOURCE_TYPE]: 'Extension';
  config: RoutesExtension;
} {
  const name = capitalize(modelName);
  registerExtension('routes', name, config, callerSource(extendRoutes));
  return { [RESOURCE_NAME]: name, [RESOURCE_TYPE]: 'Extension', config };
}

/** Applies the extensions of `extendRoutes` to the loaded routes, in the order they were declared. */
export function applyRoutesExtensions(): void {
  for (const [name, extensions] of resourceExtensions<RoutesExtension>(
    'routes'
  )) {
    const routes = context.resource.routes.get(name);
    if (!routes) {
      createRoutes({
        modelName: name,
        ...extensions.reduce<RoutesExtension>(
          (merged, { config }) => mergeRoutesConfig(merged, config),
          {}
        )
      });
      continue;
    }
    for (const { config } of extensions) {
      // The plugin of the routes reads its config object when the server starts, so it is changed in place
      Object.assign(routes.config, mergeRoutesConfig(routes.config, config));
      if (config.path) {
        routes.basePath = config.path;
      }
    }
  }
}

function mergeRoutesConfig<T extends RoutesExtension>(
  base: T,
  extension: RoutesExtension
): T {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extension)) {
    const own = merged[key];
    merged[key] =
      key !== 'mcp' &&
      key !== 'events' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      own &&
      typeof own === 'object'
        ? { ...own, ...value }
        : value;
  }
  return merged as T;
}
