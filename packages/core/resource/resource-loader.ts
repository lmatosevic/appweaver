import { TSchema, Type } from '@sinclair/typebox';
import {
  findFilesByPattern,
  importModule,
  IResourceService,
  isResourceModel,
  isResourcePolicy,
  isResourceRoutes,
  isResourceService,
  logger,
  ResourceModel,
  resourceModelProps,
  ResourcePolicyConfig,
  ResourceRoutes,
  relinkResourceModels
} from '@appweaver/common';
import { resourceConfig } from './resource-config';
import {
  validateFileNamePatterns,
  validateScalarDefaults,
  validateSoftDeleteCascades
} from '../utils';
import { ResourceContext } from '../types';
import { context } from '../context';
import { pruneUnusedModels } from './utils/prune-util';

export type LoadResourcePaths = {
  /** Path pattern used for finding files that export resource models (default: `./src/resources/"*"/*model.ts`) */
  modelPattern?: string;
  /** Path pattern used for finding files that export resource models (default: `./src/resources/"*"/*service.ts`) */
  servicePattern?: string;
  /** Path pattern used for finding files that export resource models (default: `./src/resources/"*"/*policy.ts`) */
  policyPattern?: string;
  /** Path pattern used for finding files that export resource models (default: `./src/resources/"*"/*route.ts)` */
  routePattern?: string;
};

/**
 * Loads application resources including models, services, policies, and routes.
 *
 * @param {string} [baseDir] - Optional base directory path from which to load the resources.
 *                              If not provided, defaults to the application's root directory.
 * @param {LoadResourcePaths} [paths={}] Path patterns for loading resources: models, services, policies, and routes.
 * @param {Array<() => unknown>} [moduleResources=[]] The loaders of the resources of the enabled modules, imported after
 * the files of the application, so a module model can relate to a model of the application, i.e. its auth model.
 * @return {Promise<ResourceContext>} A promise that resolves to an object containing
 * the loaded resources:
 *
 *         - `models`: The application models.
 *         - `services`: The application services.
 *         - `policies`: The access policies.
 *         - `routes`: The application routes.
 */
export async function loadResources(
  baseDir?: string,
  paths: LoadResourcePaths = {},
  moduleResources: Array<() => unknown> = []
): Promise<ResourceContext> {
  const exports = (pattern: string) =>
    findExports(pattern, baseDir ?? process.cwd(), moduleResources);

  const models = await loadModels(
    await exports(paths.modelPattern || resourceConfig.MODEL_PATTERN)
  );
  const services = loadServices(
    await exports(paths.servicePattern || resourceConfig.SERVICE_PATTERN)
  );
  const policies = loadPolicies(
    await exports(paths.policyPattern || resourceConfig.POLICY_PATTERN)
  );
  const routes = loadRoutes(
    await exports(paths.routePattern || resourceConfig.ROUTES_PATTERN)
  );

  return {
    models: new Map(Object.entries(models)),
    services: new Map(Object.entries(services)),
    policies: new Map(Object.entries(policies)),
    routes: new Map(Object.entries(routes))
  };
}

async function loadModels(
  exports: unknown[]
): Promise<Record<string, ResourceModel>> {
  const models: Record<string, ResourceModel> = {};

  for (const modelSchema of exports as ResourceModel[]) {
    if (isResourceModel(modelSchema)) {
      models[modelSchema.name] = modelSchema;
    } else {
      for (const maybeSchema of Object.values(modelSchema)) {
        if (isResourceModel(maybeSchema)) {
          models[maybeSchema.name] = maybeSchema;
        }
      }
    }
  }

  // Leave out the models of the framework the application does not use
  for (const name of pruneUnusedModels(models)) {
    context.resource.models.delete(name);
    context.resource.services.delete(name);
    context.resource.policies.delete(name);
    context.resource.routes.delete(name);
  }

  // Resolve the schemas referencing the primary key of another model, now that
  // every model is registered
  relinkResourceModels(models);

  // Reject a default value that its own field constraints would reject, since
  // the records it produces cannot be serialized by the routes of their model
  validateScalarDefaults(models);

  // Reject file name patterns writing into a reserved storage path before any
  // upload can reach the storage layer.
  validateFileNamePatterns(models);

  // Reject a cascade from a soft deleted model into one that removes its
  // records, since the database cascade never runs on a soft delete
  validateSoftDeleteCascades(models);

  // Map model variants to schemas using their corresponding suffixes
  const resourceModels: Record<string, TSchema> = {};
  for (const model of Object.values(models)) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      resourceModels[`${model.name}${suffix}`] = model[property];
    }
  }

  // Resolve all model references through the TypeBox module system
  const module = Type.Module(resourceModels);

  // Apply resolved models back to the resource schema definitions
  for (const model of Object.values(models)) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      const schemaKey = `${model.name}${suffix}`;
      const importedModel = module.Import(schemaKey);
      (model as unknown as Record<string, TSchema>)[property] = importedModel;
    }
  }

  return models;
}

function loadServices(exports: unknown[]): Record<string, IResourceService> {
  const services: Record<string, IResourceService> = {};

  for (const resourceService of exports as IResourceService[]) {
    if (isResourceService(resourceService)) {
      services[resourceService.modelName] = resourceService;
    } else {
      for (const maybeService of Object.values(resourceService)) {
        if (isResourceService(maybeService)) {
          services[maybeService.modelName] = maybeService;
        }
      }
    }
  }

  return services;
}

function loadPolicies(
  exports: unknown[]
): Record<string, ResourcePolicyConfig> {
  const policies: Record<string, ResourcePolicyConfig> = {};

  for (const resourcePolicy of exports as ResourcePolicyConfig[]) {
    if (isResourcePolicy(resourcePolicy)) {
      policies[resourcePolicy.modelName] = resourcePolicy;
    } else {
      for (const maybePolicy of Object.values(resourcePolicy)) {
        if (isResourcePolicy(maybePolicy)) {
          policies[maybePolicy.modelName] = maybePolicy;
        }
      }
    }
  }

  return policies;
}

function loadRoutes(exports: unknown[]): Record<string, ResourceRoutes> {
  const routes: Record<string, ResourceRoutes> = {};

  for (const resourceRoute of exports as ResourceRoutes[]) {
    if (isResourceRoutes(resourceRoute)) {
      routes[resourceRoute.config.modelName] = resourceRoute;
    } else {
      for (const maybeRoute of Object.values(resourceRoute)) {
        if (isResourceRoutes(maybeRoute)) {
          routes[maybeRoute.config.modelName] = maybeRoute;
        }
      }
    }
  }

  return routes;
}

/** The exports of the application files matching a pattern, then of the resources of the modules. */
async function findExports(
  pattern: string,
  cwd: string,
  moduleResources: Array<() => unknown>
): Promise<unknown[]> {
  const exports: unknown[] = [];

  for (const filePath of await findFilesByPattern(pattern, cwd)) {
    const { value, error } = await importModule(filePath);
    if (error) {
      logger.error(error, 'Resource path import error');
      continue;
    }
    if (value) {
      exports.push(value);
    }
  }

  for (const load of moduleResources) {
    exports.push(await load());
  }

  return exports;
}
