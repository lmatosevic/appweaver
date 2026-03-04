import {
  FunctionType,
  isArray,
  isString,
  isSymbol,
  logger,
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
  Ctor,
  DefinitionClass,
  DefinitionEntry,
  DefinitionMode,
  DefinitionValue,
  IResourceService,
  ResourceModel,
  ResourceRoutes
} from '../types';
import { RESOURCE_NAME } from '../constants';

/**
 * Defines a resource or a definition value within the application context.
 *
 * This method supports various resource models, services, routes, and policies,
 * determining whether to add or override the definition in the application context
 * based on the provided mode.
 *
 * @param {DefinitionValue} value The resource or definition value to be registered.
 * @param {string | DefinitionClass | undefined} nameOrClass Optional name or class reference for the definition.
 * If not provided, the name is inferred from the resource or its constructor.
 * @param mode Determines how the definition should be treated:
 *             'ignore' - Adds only if the definition doesn’t already exist.
 *             'override' - Replaces an existing definition if it matches the name.
 *             Defaults to 'ignore'.
 * @return void
 */
export function define<T = DefinitionValue, S extends T = T>(
  value: DefinitionValue,
  nameOrClass?: string | symbol | DefinitionClass<S>,
  mode: DefinitionMode = 'ignore'
): void {
  const definitionName =
    isString(nameOrClass) || isSymbol(nameOrClass)
      ? nameOrClass
      : (nameOrClass?.name ?? value[RESOURCE_NAME] ?? value.constructor?.name);
  if (isResourceModel(value)) {
    if (shouldAddDefinition(context.resource.models, definitionName, mode)) {
      context.resource.models.set(definitionName, value);
    }
  } else if (isResourceService(value)) {
    if (shouldAddDefinition(context.resource.services, definitionName, mode)) {
      context.resource.services.set(definitionName, value);
    }
  } else if (isResourceRoutes(value)) {
    if (shouldAddDefinition(context.resource.routes, definitionName, mode)) {
      context.resource.routes.set(definitionName, value);
    }
  } else if (isResourcePolicy(value)) {
    if (shouldAddDefinition(context.resource.policies, definitionName, mode)) {
      context.resource.policies.set(definitionName, value);
    }
  } else {
    const shouldAdd = shouldAddDefinition(
      context.definitions,
      definitionName,
      mode
    );
    if (shouldAdd) {
      const index =
        mode === 'override'
          ? context.definitions.findIndex((def) => def.name === definitionName)
          : -1;
      if (index > -1) {
        context.definitions.splice(index, 1, { name: definitionName, value });
      } else {
        context.definitions.push({ name: definitionName, value });
      }
    }
  }
}

/**
 * Retrieves a definition from the application context based on the provided name.
 * The method handles specific naming conventions for models, services, routes, and policies,
 * and attempts to resolve the appropriate definition. Throws an error if the definition is
 * not found, and it is marked as required.
 *
 * @param {string | DefinitionClass | FunctionType} nameOrClass - The name or class of the definition to retrieve.
 *                                        Naming conventions such as suffixes 'Model', 'Service', 'Routes', or 'Policy'
 *                                        are supported.
 * @param {boolean} [required=true] - Indicates whether the definition is required. If true
 *                                     and the definition is not found, an error is thrown.
 * @return T - The resolved definition, typed as `T`. Will be `undefined` if the definition
 *               is not found and `required` is set to `false`.
 */
export function inject<T = DefinitionValue>(
  nameOrClass: string | DefinitionClass<T> | FunctionType,
  required: boolean = true
): T {
  let definition: DefinitionValue | undefined;

  let name: string;
  if (isString(nameOrClass)) {
    name = nameOrClass;
    if (name.endsWith('Model')) {
      definition = context.resource.models.get(name.replace(/Model$/, ''));
    } else if (name.endsWith('Service')) {
      definition = context.resource.services.get(name.replace(/Service$/, ''));
    } else if (name.endsWith('Routes')) {
      definition = context.resource.routes.get(name.replace(/Routes$/, ''));
    } else if (name.endsWith('Policy')) {
      definition = context.resource.policies.get(name.replace(/Policy$/, ''));
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
 * @param {string | symbol | Ctor | FunctionType} nameOrClass The name of the definition or the
 *                                                            class constructor to find matching definitions.
 * @return {[]} An array of definitions that match the provided name or class.
 */
export function injectAll<T = DefinitionValue>(
  nameOrClass: string | symbol | Ctor<T> | FunctionType
): T[] {
  return findAllDefinitions(
    isString(nameOrClass) || isSymbol(nameOrClass)
      ? nameOrClass
      : nameOrClass.name
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
  const model = context.resource.models.get(name);

  if (!model && required) {
    throw new Error(
      `Model '${name}' is not defined in the application context`
    );
  }

  return model as ResourceModel;
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
  const service = context.resource.services.get(modelName);

  if (!service && required) {
    throw new Error(
      `Service for model '${modelName}' is not defined in the application context`
    );
  }

  return service as IResourceService;
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
  const routes = context.resource.routes.get(modelName);

  if (!routes && required) {
    throw new Error(
      `Routes for model '${modelName}' are not defined in the application context`
    );
  }

  return routes as ResourceRoutes;
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
  const policy = context.resource.policies.get(modelName);

  if (!policy && required) {
    throw new Error(
      `Policy for model '${modelName}' is not defined in the application context`
    );
  }

  return policy as ResourcePolicyConfig;
}

/**
 * Checks the existence of a definition in the context store and returns if it should be added or ignored.
 *
 * @param {Map<string | symbol, any> | DefinitionEntry[]} store - The storage object or array where definitions are maintained.
 * @param {string | symbol} name - The name of the definition to check.
 * @param {boolean} mode - How to resolve already defined definitions in context.
 * @return {boolean} Returns true if definition exists, false otherwise.
 */
function shouldAddDefinition(
  store: Map<string | symbol, any> | DefinitionEntry[],
  name: string | symbol,
  mode: DefinitionMode
): boolean {
  if (
    ((isArray(store) && findFirstDefinition(name)) ||
      (!isArray(store) && store.has(name))) &&
    mode === 'ignore'
  ) {
    logger.warn(
      `Definition '${String(name)}' is already present in the application context. Use 'append' or 'override' mode to remove this warning.`
    );
    return false;
  }

  return true;
}

/**
 * Finds the first definition object that matches the given name.
 *
 * @param {string | symbol} name - The name of the definition to search for.
 * @return {DefinitionValue|undefined} The first matching definition if found, otherwise undefined.
 */
function findFirstDefinition(
  name: string | symbol
): DefinitionValue | undefined {
  return context.definitions.find((def) => def.name === name)?.value;
}

/**
 * Finds all definitions that match the given name.
 *
 * @param {string | symbol} name - The name of the definitions to search for.
 * @return {DefinitionValue[]} An array of DefinitionValue objects that match the given name.
 */
function findAllDefinitions(name: string | symbol): DefinitionValue[] {
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
