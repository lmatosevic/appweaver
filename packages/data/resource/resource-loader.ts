import { TSchema, Type } from '@sinclair/typebox';
import {
  capitalize,
  RESOURCE_NAME,
  findFilesByPattern,
  importModule,
  IResourceService,
  isResourceModel,
  isResourcePolicy,
  isResourceService,
  createLogger,
  ResourceModel,
  resourceModelProps,
  ResourcePolicyConfig,
  relinkResourceModels,
  removeComputedKeywords
} from '@appweaver/common';
import { resourceConfig } from './resource-config';
import { validateFileNamePatterns } from '../utils/file-util';
import {
  validateRelationOmits,
  validateScalarDefaults,
  validateSoftDeleteCascades
} from '../utils/model-util';
import { ResourceContext } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { pruneUnusedModels } from './utils/prune-util';

const logger = createLogger('resource');

export type LoadResourcePaths = {
  /** Path pattern used for finding files that export resource models (default: `./src/resources/"*"/*model.ts`) */
  modelPattern?: string;
  /** Path pattern used for finding files that export resource models (default: `./src/resources/"*"/*service.ts`) */
  servicePattern?: string;
  /** Path pattern used for finding files that export resource models (default: `./src/resources/"*"/*policy.ts`) */
  policyPattern?: string;
};

/**
 * Loads the application resources: models, services and policies.
 *
 * @param {string} [baseDir] - Optional base directory path from which to load the resources.
 *                              If not provided, defaults to the application's root directory.
 * @param {LoadResourcePaths} [paths={}] Path patterns for loading the models, services and policies.
 * @param {Array<() => unknown>} [moduleResources=[]] The loaders of the resources of the enabled modules, imported after
 * the files of the application, so a module model can relate to a model of the application, i.e. its auth model.
 * @return {Promise<ResourceContext>} A promise that resolves to an object containing
 * the loaded resources:
 *
 *         - `models`: The application models.
 *         - `services`: The application services.
 *         - `policies`: The access policies.
 */
export async function loadResources(
  baseDir?: string,
  paths: LoadResourcePaths = {},
  moduleResources: Array<() => unknown> = []
): Promise<Omit<ResourceContext, 'routes'>> {
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

  return {
    models: new Map(Object.entries(models)),
    services: new Map(Object.entries(services)),
    policies: new Map(Object.entries(policies))
  };
}

async function loadModels(
  exports: unknown[]
): Promise<Record<string, ResourceModel>> {
  const models: Record<string, ResourceModel> = {};

  for (const modelSchema of exports as ResourceModel[]) {
    if (isResourceModel(modelSchema)) {
      models[modelSchema.name] = definedModel(modelSchema);
    } else {
      for (const maybeSchema of Object.values(modelSchema)) {
        if (isResourceModel(maybeSchema)) {
          models[maybeSchema.name] = definedModel(maybeSchema);
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

  // Reject an omitted relation field the related model does not have, which
  // would leave the field it was meant to hide in the output
  validateRelationOmits(models);

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
      const importedModel = removeComputedKeywords(module.Import(schemaKey));
      (model as unknown as Record<string, TSchema>)[property] = importedModel;
    }
  }

  return models;
}

function loadServices(exports: unknown[]): Record<string, IResourceService> {
  const services: Record<string, IResourceService> = {};

  for (const resourceService of exports as IResourceService[]) {
    if (isResourceService(resourceService)) {
      services[resourceName(resourceService)] = definedService(resourceService);
    } else {
      for (const maybeService of Object.values(resourceService)) {
        if (isResourceService(maybeService)) {
          services[resourceName(maybeService)] = definedService(maybeService);
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
      policies[resourceName(resourcePolicy)] = definedPolicy(resourcePolicy);
    } else {
      for (const maybePolicy of Object.values(resourcePolicy)) {
        if (isResourcePolicy(maybePolicy)) {
          policies[resourceName(maybePolicy)] = definedPolicy(maybePolicy);
        }
      }
    }
  }

  return policies;
}

/** The exports of the application files matching a pattern, then of the resources of the modules. */
/**
 * The definitions the context holds under the name of a loaded one. Two files defining the same name (i.e. an
 * application model named like a framework model) keep the first one, or the one defined with `override`, and the
 * context warns about the other one; the loader follows the context, so the definition it links and validates is
 * the one every service and route uses.
 */
function definedModel(model: ResourceModel): ResourceModel {
  return context.resource.models.get(model.name) ?? model;
}

function definedService(service: IResourceService): IResourceService {
  return (
    (context.resource.services.get(resourceName(service)) as
      | IResourceService
      | undefined) ?? service
  );
}

function definedPolicy(policy: ResourcePolicyConfig): ResourcePolicyConfig {
  return context.resource.policies.get(resourceName(policy)) ?? policy;
}

/** The name a service class or a policy is defined under, the capitalized name of its model. */
function resourceName(
  resource: IResourceService | ResourcePolicyConfig
): string {
  return (
    (resource as unknown as Record<symbol, string>)[RESOURCE_NAME] ??
    capitalize(resource.modelName)
  );
}

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
