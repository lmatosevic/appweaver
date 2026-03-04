import { globSync } from 'glob';
import { TObject, TSchema, Type } from '@sinclair/typebox';
import { config, logger, ResourcePolicyConfig } from '@appweaver/common';
import {
  importModule,
  isResourceModel,
  isResourcePolicy,
  isResourceRoutes,
  isResourceService,
  resourceModelProps
} from '../utils';
import {
  IResourceService,
  ResourceContext,
  ResourceModel,
  ResourceRoutes
} from '../types';

/**
 * Loads application resources including models, services, policies, and routes.
 *
 * @param {string} [baseDir] - Optional base directory path from which to load the resources.
 *                              If not provided, defaults to the application's root directory.
 * @return {Promise<ResourceContext>} A promise that resolves to an object containing
 * the loaded resources:
 *
 *         - `models`: The application models.
 *         - `services`: The application services.
 *         - `policies`: The access policies.
 *         - `routes`: The application routes.
 */
export async function loadResources(
  baseDir?: string
): Promise<ResourceContext> {
  const models = await loadModels(baseDir);
  const services = await loadServices(baseDir);
  const policies = await loadPolicies(baseDir);
  const routes = await loadRoutes(baseDir);

  return {
    models: new Map(Object.entries(models)),
    services: new Map(Object.entries(services)),
    policies: new Map(Object.entries(policies)),
    routes: new Map(Object.entries(routes))
  };
}

async function loadModels(
  baseDir?: string,
  modelPattern: string = './resources/**/*model.js'
): Promise<Record<string, ResourceModel>> {
  const cwd = baseDir ?? process.cwd();

  const models: Record<string, ResourceModel> = {};

  const modelPaths = globSync(modelPattern, { cwd, absolute: true });

  // Add exported core module resource models
  modelPaths.push('@appweaver/core');

  // Add additional modules from config
  for (const module of config.APP_AUTOLOAD_MODULES) {
    modelPaths.push(module);
  }

  for (const path of modelPaths) {
    const modelSchema = await importPath<ResourceModel>(path);
    if (!modelSchema) {
      continue;
    }

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
      model[property] = importedModel as unknown as TObject;
    }
  }

  return models;
}

async function loadServices(
  baseDir?: string,
  servicePattern: string = './resources/**/*service.js'
): Promise<Record<string, IResourceService>> {
  const cwd = baseDir ?? process.cwd();

  const services: Record<string, IResourceService> = {};

  const servicePaths = globSync(servicePattern, { cwd, absolute: true });

  for (const path of servicePaths) {
    const resourceService = await importPath<IResourceService>(path);
    if (!resourceService) {
      continue;
    }

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

async function loadPolicies(
  baseDir?: string,
  policyPattern: string = './resources/**/*policy.js'
): Promise<Record<string, ResourcePolicyConfig>> {
  const cwd = baseDir ?? process.cwd();

  const policies: Record<string, ResourcePolicyConfig> = {};

  const policyPaths = globSync(policyPattern, { cwd, absolute: true });

  for (const path of policyPaths) {
    const resourcePolicy = await importPath<ResourcePolicyConfig>(path);
    if (!resourcePolicy) {
      continue;
    }

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

async function loadRoutes(
  baseDir?: string,
  routePattern: string = './resources/**/*route.js'
): Promise<Record<string, ResourceRoutes>> {
  const cwd = baseDir ?? process.cwd();

  const routes: Record<string, ResourceRoutes> = {};

  const routePaths = globSync(routePattern, { cwd, absolute: true });

  for (const path of routePaths) {
    const resourceRoute = await importPath<ResourceRoutes>(path);
    if (!resourceRoute) {
      continue;
    }

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

async function importPath<T>(filePath: string): Promise<T | null> {
  const { value, error } = await importModule<T>(filePath);
  if (error) {
    logger.error(error);
    return null;
  }
  return value;
}
