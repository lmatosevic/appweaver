import { globSync } from 'glob';
import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  isObject,
  logger,
  resourceModelProps,
  ResourceModelSchema,
  ResourcePolicyConfig,
  ResourceRoutesConfig
} from '@appweaver/common';
import { ResourceService } from './resource-service';
import { ApplicationContext, RouteHandler } from '../types';

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
    routes
  };
}

export async function loadModels(
  baseDir?: string,
  modelPattern: string = './resources/**/*model.js'
): Promise<Record<string, ResourceModelSchema>> {
  const cwd = baseDir ?? process.cwd();

  const models: Record<string, ResourceModelSchema> = {};

  const modelPaths = globSync(modelPattern, { cwd, absolute: true });

  // Include core module resource models from the @appweaver/core package
  modelPaths.push('@appweaver/core');

  const isModelSchema = (schema: unknown): schema is ResourceModelSchema => {
    return (
      isObject(schema) &&
      schema !== null &&
      'name' in schema &&
      'config' in schema &&
      'readModel' in schema
    );
  };

  for (const path of modelPaths) {
    const modelSchema = await importPath<ResourceModelSchema>(path);
    if (!modelSchema) {
      continue;
    }

    if (isModelSchema(modelSchema)) {
      models[modelSchema.name] = modelSchema;
    } else {
      for (const maybeSchema of Object.values(modelSchema)) {
        if (isModelSchema(maybeSchema)) {
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

  const isResourceService = (service: unknown): service is ResourceService => {
    return (
      isObject(service) &&
      service !== null &&
      'modelName' in service &&
      'model' in service
    );
  };

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

  const isResourcePolicy = (
    policy: unknown
  ): policy is ResourcePolicyConfig => {
    return isObject(policy) && policy !== null && 'name' in policy;
  };

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
): Promise<
  Record<string, { config: ResourceRoutesConfig; handler: RouteHandler }>
> {
  const cwd = baseDir ?? process.cwd();

  const routes: Record<
    string,
    { config: ResourceRoutesConfig; handler: RouteHandler }
  > = {};

  const routePaths = globSync(routePattern, { cwd, absolute: true });

  const isResourceRoute = (
    route: unknown
  ): route is { config: ResourceRoutesConfig; handler: RouteHandler } => {
    return (
      isObject(route) &&
      route !== null &&
      'config' in route &&
      'handler' in route &&
      isObject(route.config) &&
      route.config !== null &&
      'name' in route.config
    );
  };

  for (const path of routePaths) {
    const resourceRoute = await importPath<{
      config: ResourceRoutesConfig;
      handler: RouteHandler;
    }>(path);
    if (!resourceRoute) {
      continue;
    }

    if (isResourceRoute(resourceRoute)) {
      routes[resourceRoute.config.modelName] = resourceRoute;
    } else {
      for (const maybeRoute of Object.values(resourceRoute)) {
        if (isResourceRoute(maybeRoute)) {
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
