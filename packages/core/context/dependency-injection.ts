import { ResourceModelSchema } from '@appweaver/common';
import { context } from './context';
import { ResourceService } from '../resource';
import { DefinitionValue } from '../types';

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
  if (name in context.definitions && !override) {
    throw new Error(
      `Definition '${name}' is already defined in the application context`
    );
  }

  context.definitions[name] = value;
}

/**
 * Retrieves a definition from the application context by its name.
 * If the definition is not found and it is marked as required, an error is thrown.
 *
 * @param {string} name - The name of the definition to retrieve.
 * @param {boolean} [required=true] - Indicates whether to throw an error if the definition is not found.
 * @return {T} The definition value associated with the given name.
 * @template T
 */
export function inject<T = DefinitionValue>(
  name: string,
  required: boolean = true
): T {
  const definition = context.definitions[name];

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
 * @param {string} modelName - The name of the model to inject.
 * @param {boolean} [required=true] - Indicates whether the model is required. If true, an error is thrown when the model is not found.
 * @return {ResourceModelSchema} The injected model from the application context.
 */
export function injectModel(
  modelName: string,
  required: boolean = true
): ResourceModelSchema {
  const model = context.models[modelName];

  if (!model && required) {
    throw new Error(
      `Model '${modelName}' is not defined in the application context`
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
      `Service '${modelName}Service' is not defined in the application context`
    );
  }

  return service;
}
