import { glob } from 'glob';
import { TObject, TSchema, Type } from '@sinclair/typebox';
import { config, logger, ResourcePolicyConfig } from '@appweaver/common';
import {
  importModule,
  isResourceModel,
  isResourcePolicy,
  isResourceRoutes,
  isResourceService,
  resourceModelProps,
  sanitizePath
} from '../utils';
import {
  IResourceService,
  ResourceContext,
  ResourceModel,
  ResourceRoutes
} from '../types';

export type LoadResourcePaths = {
  /** Path pattern used for finding files that export resource models (default: ./src/resources/**\\/*model.ts) */
  modelPattern?: string;
  /** Path pattern used for finding files that export resource models (default: ./src/resources/**\\/*service.ts) */
  servicePattern?: string;
  /** Path pattern used for finding files that export resource models (default: ./src/resources/**\\/*policy.ts) */
  policyPattern?: string;
  /** Path pattern used for finding files that export resource models (default: ./src/resources/**\\/*route.ts) */
  routePattern?: string;
};

/**
 * Loads application resources including models, services, policies, and routes.
 *
 * @param {string} [baseDir] - Optional base directory path from which to load the resources.
 *                              If not provided, defaults to the application's root directory.
 * @param {LoadResourcePaths} [paths={}] Path patterns for loading resources: models, services, policies, and routes.
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
  paths: LoadResourcePaths = {}
): Promise<ResourceContext> {
  const models = await loadModels(baseDir, paths.modelPattern);
  const services = await loadServices(baseDir, paths.servicePattern);
  const policies = await loadPolicies(baseDir, paths.policyPattern);
  const routes = await loadRoutes(baseDir, paths.routePattern);

  return {
    models: new Map(Object.entries(models)),
    services: new Map(Object.entries(services)),
    policies: new Map(Object.entries(policies)),
    routes: new Map(Object.entries(routes))
  };
}

async function loadModels(
  baseDir?: string,
  modelPattern?: string
): Promise<Record<string, ResourceModel>> {
  const cwd = baseDir ?? process.cwd();
  const pathPattern = modelPattern || config.RESOURCE_MODEL_PATTERN;

  const models: Record<string, ResourceModel> = {};

  const modelPaths = await findAllFiles(pathPattern, cwd);

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
  servicePattern?: string
): Promise<Record<string, IResourceService>> {
  const cwd = baseDir ?? process.cwd();
  const pathPattern = servicePattern || config.RESOURCE_SERVICE_PATTERN;

  const services: Record<string, IResourceService> = {};

  const servicePaths = await findAllFiles(pathPattern, cwd);

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
  policyPattern?: string
): Promise<Record<string, ResourcePolicyConfig>> {
  const cwd = baseDir ?? process.cwd();
  const pathPattern = policyPattern || config.RESOURCE_POLICY_PATTERN;

  const policies: Record<string, ResourcePolicyConfig> = {};

  const policyPaths = await findAllFiles(pathPattern, cwd);

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
  routePattern?: string
): Promise<Record<string, ResourceRoutes>> {
  const cwd = baseDir ?? process.cwd();
  const pathPattern = routePattern || config.RESOURCE_ROUTE_PATTERN;

  const routes: Record<string, ResourceRoutes> = {};

  const routePaths = await findAllFiles(pathPattern, cwd);

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

async function findAllFiles(pattern: string, cwd: string): Promise<string[]> {
  const files: string[] = [];

  // Add project files using a pattern
  const jsPaths = sanitizePath(pattern);
  const strippedPattern = stripOverlappingPath(jsPaths, cwd);
  const projectFiles = await glob(strippedPattern, { cwd, absolute: true });
  files.push(...projectFiles);

  // Add exported core module resources
  files.push('@appweaver/core/resources');

  // Add additional modules from config
  for (const module of config.APP_AUTOLOAD_MODULES) {
    files.push(module);
  }

  return files;
}

function stripOverlappingPath(pattern: string, cwd: string): string {
  const normalize = (p: string): string => {
    return p.replace(/\\/g, '/').replace(/^\.\//, '');
  };

  const patSeg = normalize(pattern).split('/').filter(Boolean);
  const cwdSeg = normalize(cwd).split('/').filter(Boolean);

  // find longest k where last k segments of cwd == first k segments of a pattern
  let k = Math.min(cwdSeg.length, patSeg.length);
  for (; k > 0; k--) {
    const cwdTail = cwdSeg.slice(-k).join('/');
    const patHead = patSeg.slice(0, k).join('/');
    if (cwdTail === patHead) {
      break;
    }
  }

  const remaining = patSeg.slice(k).join('/');
  return remaining ? `./${remaining}` : './';
}

async function importPath<T>(filePath: string): Promise<T | null> {
  const { value, error } = await importModule<T>(filePath);
  if (error) {
    logger.error(error, 'Resource path import error');
    return null;
  }
  return value;
}
