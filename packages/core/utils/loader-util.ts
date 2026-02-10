import { globSync } from 'glob';
import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  logger,
  ResourceModelSchema,
  ResourcePolicyConfig,
  ResourceRoutesConfig
} from '@appweaver/common';
import { ResourceService } from '../resource';
import { ApplicationContext, RouteHandler } from '../types';

export async function loadResources(): Promise<
  Omit<ApplicationContext, 'server'>
> {
  const models = await loadModels();
  const services = await loadServices();
  const policies = await loadPolicies();
  const routes = await loadRoutes();

  return {
    models,
    services,
    policies,
    routes
  };
}

export async function loadModels(
  modelPattern: string = './dist/resources/**/*model.js'
): Promise<Record<string, ResourceModelSchema>> {
  const cwd = process.cwd();

  const models: Record<string, ResourceModelSchema> = {};

  const modelPaths = globSync(modelPattern, { cwd, absolute: true });

  // Add exported core module resource models
  modelPaths.push('@appweaver/core');

  const isModelSchema = (schema: unknown): schema is ResourceModelSchema => {
    return (
      typeof schema === 'object' &&
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

  const modelNameProps: Record<
    string,
    keyof Partial<Omit<ResourceModelSchema, 'name' | 'config'>>
  > = {
    '': 'readModel',
    Single: 'readOneModel',
    Multiple: 'readManyModel',
    Create: 'createOneModel',
    Update: 'updateOneModel',
    Files: 'filesModel',
    FileUpload: 'fileUploadModel',
    FileDelete: 'fileDeleteModel'
  };

  // Map models to schemas using ids (suffixes)
  const resourceModels: Record<string, TSchema> = {};
  for (const model of Object.values(models)) {
    for (const [suffix, property] of Object.entries(modelNameProps)) {
      resourceModels[`${model.name}${suffix}`] = model[property];
    }
  }

  // Resolve all models references
  const module = Type.Module(resourceModels);

  // Return resolved models to the resource schema model
  for (const model of Object.values(models)) {
    for (const [suffix, property] of Object.entries(modelNameProps)) {
      const schemaKey = `${model.name}${suffix}`;
      const importedModel = module.Import(schemaKey);
      model[property] = importedModel as unknown as TObject;
    }
  }

  return models;
}

export async function loadServices(
  servicePattern: string = './dist/resources/**/*service.js'
): Promise<Record<string, ResourceService>> {
  const cwd = process.cwd();

  const services: Record<string, ResourceService> = {};

  const servicePaths = globSync(servicePattern, { cwd, absolute: true });

  const isResourceService = (service: unknown): service is ResourceService => {
    return (
      typeof service === 'object' &&
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
  policyPattern: string = './dist/resources/**/*policy.js'
): Promise<Record<string, ResourcePolicyConfig>> {
  const cwd = process.cwd();

  const policies: Record<string, ResourcePolicyConfig> = {};

  const policyPaths = globSync(policyPattern, { cwd, absolute: true });

  const isResourcePolicy = (
    policy: unknown
  ): policy is ResourcePolicyConfig => {
    return typeof policy === 'object' && policy !== null && 'name' in policy;
  };

  for (const path of policyPaths) {
    const resourcePolicy = await importPath<ResourcePolicyConfig>(path);
    if (!resourcePolicy) {
      continue;
    }

    if (isResourcePolicy(resourcePolicy)) {
      policies[resourcePolicy.name] = resourcePolicy;
    } else {
      for (const maybePolicy of Object.values(resourcePolicy)) {
        if (isResourcePolicy(maybePolicy)) {
          policies[maybePolicy.name] = maybePolicy;
        }
      }
    }
  }

  return policies;
}

export async function loadRoutes(
  routePattern: string = './dist/resources/**/*route.js'
): Promise<
  Record<string, { config: ResourceRoutesConfig; handler: RouteHandler }>
> {
  const cwd = process.cwd();

  const routes: Record<
    string,
    { config: ResourceRoutesConfig; handler: RouteHandler }
  > = {};

  const routePaths = globSync(routePattern, { cwd, absolute: true });

  const isResourceRoute = (
    route: unknown
  ): route is { config: ResourceRoutesConfig; handler: RouteHandler } => {
    return (
      typeof route === 'object' &&
      route !== null &&
      'config' in route &&
      'handler' in route &&
      typeof route.config === 'object' &&
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
      routes[resourceRoute.config.name] = resourceRoute;
    } else {
      for (const maybeRoute of Object.values(resourceRoute)) {
        if (isResourceRoute(maybeRoute)) {
          routes[maybeRoute.config.name] = maybeRoute;
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
