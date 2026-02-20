import { globSync } from 'glob';
import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  logger,
  ResourceModel,
  resourceModelProps,
  ResourcePolicyConfig
} from '@appweaver/common';
import { ResourceService } from './resource-service';
import {
  isResourceModel,
  isResourcePolicy,
  isResourceRoutes,
  isResourceService
} from '../utils';
import { ApplicationContext, ResourceRoutes } from '../types';

export async function loadResources(
  baseDir?: string
): Promise<Omit<ApplicationContext, 'server'>> {
  const models = await loadModels(baseDir);
  const services = await loadServices(baseDir);
  const policies = await loadPolicies(baseDir);
  const routes = await loadRoutes(baseDir);

  return {
    models,
    services,
    policies,
    routes,
    definitions: {}
  };
}

export async function loadModels(
  baseDir?: string,
  modelPattern: string = './resources/**/*model.js'
): Promise<Record<string, ResourceModel>> {
  const cwd = baseDir ?? process.cwd();

  const models: Record<string, ResourceModel> = {};

  const modelPaths = globSync(modelPattern, { cwd, absolute: true });

  // Include core module resource models from the @appweaver/core package
  modelPaths.push('@appweaver/core');

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

export async function loadServices(
  baseDir?: string,
  servicePattern: string = './resources/**/*service.js'
): Promise<Record<string, ResourceService>> {
  const cwd = baseDir ?? process.cwd();

  const services: Record<string, ResourceService> = {};

  const servicePaths = globSync(servicePattern, { cwd, absolute: true });

  for (const path of servicePaths) {
    const resourceService = await importPath<ResourceService>(path);
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

export async function loadPolicies(
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

export async function loadRoutes(
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
  try {
    const jsPath = filePath.replace(/\.ts$/i, '.js');
    const exportedValue = await import(jsPath);
    return exportedValue.default || exportedValue;
  } catch (e) {
    logger.error(e);
    return null;
  }
}
