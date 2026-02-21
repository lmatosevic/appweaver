import { ResourcePolicyConfig } from '@appweaver/common';
import { context } from './context';
import { ResourceService } from '../resource';
import { DefinitionValue, ResourceModel, ResourceRoutes } from '../types';
import {
  isResourceModel,
  isResourcePolicy,
  isResourceRoutes,
  isResourceService
} from '../utils';

/**
 * Defines a new entry in the application context with the given name and value.
 * If an entry already exists with the same name, it may only be overridden if the `override` flag is set to true.
 *
 * @param {string} name - The name of the definition to be added.
 * @param {DefinitionValue} value - The value associated with the definition.
 * @param {boolean} [override=false] - A flag indicating whether to override an existing definition with the same name.
 * @return {void} This function does not return a value.
 * @throws {Error} Throws an error if the definition already exists and the override flag is not enabled.
 */
export function define(
  name: string,
  value: DefinitionValue,
  override: boolean = false
): void {
  if (isResourceModel(value)) {
    checkDefinitionExistence(name, context.models, override);
    context.models[name] = value;
  } else if (isResourceService(value)) {
    checkDefinitionExistence(name, context.services, override);
    context.services[name] = value;
  } else if (isResourceRoutes(value)) {
    checkDefinitionExistence(name, context.routes, override);
    context.routes[name] = value;
  } else if (isResourcePolicy(value)) {
    checkDefinitionExistence(name, context.policies, override);
    context.policies[name] = value;
  } else {
    checkDefinitionExistence(name, context.definitions, override);
    context.definitions[name] = value;
  }
}

/**
 * Retrieves a definition from the application context based on the provided name.
 * The method handles specific naming conventions for models, services, routes, and policies,
 * and attempts to resolve the appropriate definition. Throws an error if the definition is
 * not found, and it is marked as required.
 *
 * @param {string} name - The name of the definition to retrieve. Naming conventions such as
 *                        suffixes 'Model', 'Service', 'Routes', or 'Policy' are supported.
 * @param {boolean} [required=true] - Indicates whether the definition is required. If true
 *                                     and the definition is not found, an error is thrown.
 * @return T - The resolved definition, typed as `T`. Will be `undefined` if the definition
 *               is not found and `required` is set to `false`.
 */
export function inject<T = DefinitionValue>(
  name: string,
  required: boolean = true
): T {
  let definition: DefinitionValue | undefined;

  if (name.endsWith('Model')) {
    definition = context.models[name.replace(/Model$/, '')];
  } else if (name.endsWith('Service')) {
    definition = context.services[name.replace(/Service$/, '')];
  } else if (name.endsWith('Routes')) {
    definition = context.routes[name.replace(/Routes$/, '')];
  } else if (name.endsWith('Policy')) {
    definition = context.policies[name.replace(/Policy$/, '')];
  } else {
    definition = context.definitions[name];
  }

  if (!definition && required) {
    throw new Error(
      `Definition '${name}' is not defined in the application context`
    );
  }

  return definition as T;
}

/**
 * Injects a model from the application context based on the provided model name.
 * Throws an error if the model is not found and the required flag is set to true.
 *
 * @param {string} name - The name of the model to inject.
 * @param {boolean} [required=true] - Indicates whether the model is required. If true, an error is thrown when the model is not found.
 * @return {ResourceModel} The injected model from the application context.
 */
export function injectModel(
  name: string,
  required: boolean = true
): ResourceModel {
  const model = context.models[name];

  if (!model && required) {
    throw new Error(
      `Model '${name}' is not defined in the application context`
    );
  }

  return model;
}

/**
 * Injects and retrieves a service instance from the application context based on the provided model name.
 *
 * @param {string} modelName - The name of the model whose service needs to be injected.
 * @param {boolean} [required=true] - Indicates if the service is mandatory. If true and the service is not available, an error is thrown.
 * @return {ResourceService} The service instance corresponding to the specified model name.
 * @throws {Error} If the service cannot be found in the application context and `required` is true.
 */
export function injectService(
  modelName: string,
  required: boolean = true
): ResourceService {
  const service = context.services[modelName];

  if (!service && required) {
    throw new Error(
      `Service for model '${modelName}' is not defined in the application context`
    );
  }

  return service;
}

/**
 * Injects a route into the application context based on the provided route name.
 *
 * @param {string} modelName - The name of the model whose route to retrieve from the application context.
 * @param {boolean} [required=true] - Specifies whether the route is mandatory. If true and the route is not found, an error will be thrown.
 * @return {ResourceRoutes} The retrieved route configuration.
 * @throws {Error} If the route with the specified name is not found, and the `required` parameter is set to true.
 */
export function injectRoutes(
  modelName: string,
  required: boolean = true
): ResourceRoutes {
  const routes = context.routes[modelName];

  if (!routes && required) {
    throw new Error(
      `Routes for model '${modelName}' are not defined in the application context`
    );
  }

  return routes;
}

/**
 * Injects a policy configuration from the application context by its name.
 *
 * @param {string} modelName - The name of the model whose policy to retrieve.
 * @param {boolean} [required=true] - Indicates whether the policy is required. If true and the policy does not exist, an error is thrown.
 * @return {ResourcePolicyConfig} The policy configuration object associated with the provided name.
 * @throws {Error} If the policy is required and not found in the application context.
 */
export function injectPolicy(
  modelName: string,
  required: boolean = true
): ResourcePolicyConfig {
  const policy = context.policies[modelName];

  if (!policy && required) {
    throw new Error(
      `Policy for model '${modelName}' is not defined in the application context`
    );
  }

  return policy;
}

/**
 * Checks if a definition exists in the given store and optionally overrides it.
 *
 * @param {string} name - The name of the definition to check.
 * @param {Record<string, any>} store - The storage object where definitions are maintained.
 * @param {boolean} [override=false] - Whether to override the existing definition if it already exists.
 * @return {void} Throws an error if the definition exists and override is false.
 */
function checkDefinitionExistence(
  name: string,
  store: Record<string, any>,
  override: boolean = false
): void {
  if (name in store && !override) {
    throw new Error(
      `Definition '${name}' is already present in the application context`
    );
  }
}
