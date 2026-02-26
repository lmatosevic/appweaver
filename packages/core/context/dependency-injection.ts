import {
  FunctionType,
  isArray,
  isString,
  ResourcePolicyConfig
} from '@appweaver/common';
import { context } from './context';
import {
  isResourceModel,
  isResourcePolicy,
  isResourceRoutes,
  isResourceService
} from '../utils';
import {
  DefinitionEntry,
  DefinitionValue,
  IResourceService,
  ResourceModel,
  ResourceRoutes
} from '../types';
import { RESOURCE_NAME } from '../constants';

/**
 * Defines a new entry in the application context with the given name and value.
 * If an entry already exists with the same name, it may only be overridden if the `append` flag is set to true.
 *
 * @param {DefinitionValue} value - The value associated with the definition.
 * @param {string | undefined} name - The name of the definition to be added.
 * @param {boolean} [append=false] - A flag indicating whether to append an existing definition with the same name.
 * @throws {Error} Throws an error if the definition already exists and the append flag is not enabled.
 */
export function define(
  value: DefinitionValue,
  name?: string,
  append: boolean = false
): void {
  const definitionName =
    name ?? value[RESOURCE_NAME] ?? value.constructor?.name;
  if (isResourceModel(value)) {
    checkDefinitionExistence(context.resource.models, definitionName, append);
    context.resource.models[definitionName] = value;
  } else if (isResourceService(value)) {
    checkDefinitionExistence(context.resource.services, definitionName, append);
    context.resource.services[definitionName] = value;
  } else if (isResourceRoutes(value)) {
    checkDefinitionExistence(context.resource.routes, definitionName, append);
    context.resource.routes[definitionName] = value;
  } else if (isResourcePolicy(value)) {
    checkDefinitionExistence(context.resource.policies, definitionName, append);
    context.resource.policies[definitionName] = value;
  } else {
    checkDefinitionExistence(context.definitions, definitionName, append);
    context.definitions.push({ name: definitionName, value });
  }
}

/**
 * Retrieves a definition from the application context based on the provided name.
 * The method handles specific naming conventions for models, services, routes, and policies,
 * and attempts to resolve the appropriate definition. Throws an error if the definition is
 * not found, and it is marked as required.
 *
 * @param {string | Object | FunctionType} nameOrClass - The name or class of the definition to retrieve.
 *                                        Naming conventions such as suffixes 'Model', 'Service',
 *                                        'Routes', or 'Policy' are supported.
 * @param {boolean} [required=true] - Indicates whether the definition is required. If true
 *                                     and the definition is not found, an error is thrown.
 * @return T - The resolved definition, typed as `T`. Will be `undefined` if the definition
 *               is not found and `required` is set to `false`.
 */
export function inject<T = DefinitionValue>(
  nameOrClass: string | { new (...args: any[]): T } | FunctionType,
  required: boolean = true
): T {
  let definition: DefinitionValue | undefined;

  let name: string;
  if (isString(nameOrClass)) {
    name = nameOrClass;
    if (name.endsWith('Model')) {
      definition = context.resource.models[name.replace(/Model$/, '')];
    } else if (name.endsWith('Service')) {
      definition = context.resource.services[name.replace(/Service$/, '')];
    } else if (name.endsWith('Routes')) {
      definition = context.resource.routes[name.replace(/Routes$/, '')];
    } else if (name.endsWith('Policy')) {
      definition = context.resource.policies[name.replace(/Policy$/, '')];
    } else {
      definition = findFirstDefinition(name);
    }
  } else {
    name = nameOrClass.name;
    definition = findFirstDefinition(name);
  }

  if (!definition && required) {
    throw new Error(
      `Definition '${name}' is not defined in the application context`
    );
  }

  return definition as T;
}

/**
 * Injects all definitions that match the specified name or class.
 *
 * @param {string | { new (...args: any[]): any } | FunctionType} nameOrClass The name of the definition or the
 *                                                                        class constructor to find matching definitions.
 * @return {[]} An array of definitions that match the provided name or class.
 */
export function injectAll<T = DefinitionValue>(
  nameOrClass: string | { new (...args: any[]): T } | FunctionType
): T[] {
  return findAllDefinitions(
    isString(nameOrClass) ? nameOrClass : nameOrClass.name
  ) as T[];
}

/**
 * Injects all definitions that satisfy the specified search function criteria.
 *
 * @param {function(DefinitionValue): boolean} searchFunction - A callback function used to filter definitions.
 *                                                              It should return true for definitions that match the desired criteria.
 * @return {[]} An array of definitions that meet the criteria specified by the search function.
 */
export function injectAllWhere<T = DefinitionValue>(
  searchFunction: (definition: DefinitionEntry) => boolean
): T[] {
  return findAllDefinitionsWhere(searchFunction) as T[];
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
  const model = context.resource.models[name];

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
 * @return {IResourceService} The service instance corresponding to the specified model name.
 * @throws {Error} If the service cannot be found in the application context and `required` is true.
 */
export function injectService(
  modelName: string,
  required: boolean = true
): IResourceService {
  const service = context.resource.services[modelName];

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
  const routes = context.resource.routes[modelName];

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
  const policy = context.resource.policies[modelName];

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
 * @param {Record<string, any> | DefinitionEntry[]} store - The storage object or array where definitions are maintained.
 * @param {string} name - The name of the definition to check.
 * @param {boolean} [append=false] - Whether to append the existing definition if it already exists.
 * @return {void} Throws an error if the definition exists and append is false.
 */
function checkDefinitionExistence(
  store: Record<string, any> | DefinitionEntry[],
  name: string,
  append: boolean = false
): void {
  if (
    ((isArray(store) && findFirstDefinition(name)) ||
      (!isArray(store) && name in store)) &&
    !append
  ) {
    throw new Error(
      `Definition '${name}' is already present in the application context`
    );
  }
}

/**
 * Finds the first definition object that matches the given name.
 *
 * @param {string} name - The name of the definition to search for.
 * @return {DefinitionValue|undefined} The first matching definition if found, otherwise undefined.
 */
function findFirstDefinition(name: string): DefinitionValue | undefined {
  return context.definitions.find((def) => def.name === name)?.value;
}

/**
 * Finds all definitions that match the given name.
 *
 * @param name The name of the definitions to search for.
 * @return An array of DefinitionValue objects that match the given name.
 */
function findAllDefinitions(name: string): DefinitionValue[] {
  return context.definitions
    .filter((def) => def.name === name)
    .map((def) => def.value);
}

/**
 * Filters and retrieves all definitions from the context that match the specified search criteria.
 *
 * @param {function(DefinitionEntry): boolean} search - A callback function used to test each definition.
 *        Should return true for definitions that meet the desired condition.
 * @return {DefinitionValue[]} An array of definitions that match the search criteria.
 */
function findAllDefinitionsWhere(
  search: (def: DefinitionEntry) => boolean
): DefinitionValue[] {
  return context.definitions.filter(search).map((def) => def.value);
}
