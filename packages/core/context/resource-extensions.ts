import { context } from './context';
import {
  ResourceExtension,
  ResourceExtensionKind
} from '../types/application-context';

/**
 * Registers the extension of a resource of a model, which the loader of its kind applies once every resource is
 * loaded, in the order of registration.
 *
 * @param {ResourceExtensionKind} kind - The kind of resource extended.
 * @param {string} name - The name of the model.
 * @param {Object} config - The extension.
 * @param {string} [source] - The file declaring it.
 */
export function registerExtension<T>(
  kind: ResourceExtensionKind,
  name: string,
  config: T,
  source?: string
): void {
  context.resource.extensions ??= new Map();
  const byName = context.resource.extensions.get(kind) ?? new Map();
  context.resource.extensions.set(kind, byName);
  byName.set(name, [...(byName.get(name) ?? []), { config, source }]);
}

/**
 * The extensions of a kind of resource, by model name.
 *
 * @param {ResourceExtensionKind} kind - The kind of resource extended.
 * @return {Map<string, ResourceExtension[]>} The extensions.
 */
export function resourceExtensions<T>(
  kind: ResourceExtensionKind
): Map<string, ResourceExtension<T>[]> {
  return (context.resource.extensions?.get(kind) ?? new Map()) as Map<
    string,
    ResourceExtension<T>[]
  >;
}
