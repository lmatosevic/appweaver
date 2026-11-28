import {
  defaultScalarValue,
  extractResourceName,
  extractSchemaProperties,
  isArray,
  isFunction,
  isPlainObject,
  ResourceModel
} from '@appweaver/common';
import { injectModel } from '@appweaver/core';

/**
 * Projects virtual field values onto a resource object based on its model definition. Virtual fields with an output
 * value function are evaluated against the resource, constant output values are assigned directly, and remaining
 * required virtual fields receive their default value. Nested relation and file objects are projected recursively
 * using their own model definitions.
 *
 * @param {Object} resource - The resource object to project virtual fields onto.
 * @param {string} resourceName - The name of the resource model describing the object.
 * @return {Object} A copy of the resource object with all virtual field values set.
 */
export function projectVirtualFields<T>(resource: T, resourceName: string): T {
  if (!resource) {
    return resource;
  }

  const projectedVirtual = { ...resource };

  const resourceModel = injectModel(resourceName, false);

  // Set output or default value for virtual fields
  for (const [fieldName, virtual] of Object.entries(
    resourceModel?.config?.virtual ?? {}
  )) {
    const outputValue = virtual.output?.value;
    if (isFunction(outputValue)) {
      projectedVirtual[fieldName] = outputValue(projectedVirtual);
    } else if (outputValue) {
      projectedVirtual[fieldName] = outputValue;
    } else if (virtual.required !== false) {
      projectedVirtual[fieldName] =
        virtual.default ?? defaultScalarValue(virtual);
    }
  }

  // Recursively project virtual fields for nested relational objects
  const nestedModels = resourceModel ? nestedResourceNames(resourceModel) : {};
  for (const key in projectedVirtual) {
    const nestedResourceName = nestedModels[key];
    if (!nestedResourceName) {
      continue;
    }

    const value = projectedVirtual[key];
    if (isPlainObject(value) || (isArray(value) && isPlainObject(value[0]))) {
      projectedVirtual[key] = isArray(value)
        ? (value.map((item: any) =>
            projectVirtualFields(item, nestedResourceName)
          ) as any)
        : projectVirtualFields(value, nestedResourceName);
    }
  }

  return projectedVirtual;
}

// The models of the relation and file fields of a model, resolved once per schema instead of once per record. Keyed
// by the relations schema, which is replaced when the model is linked again, so a stale entry is never read
const nestedModelsCache = new WeakMap<object, Record<string, string>>();

/**
 * Resolves the model names of the relation and file fields of a model.
 *
 * @param {ResourceModel} resourceModel - The model.
 * @return {Object} The related model name of every relation and file field, by field name.
 */
function nestedResourceNames(
  resourceModel: ResourceModel
): Record<string, string> {
  const cacheKey = resourceModel.relationsModel ?? resourceModel;
  const cached = nestedModelsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const names: Record<string, string> = {};
  const fields = [
    ...Object.keys(resourceModel.config?.relations ?? {}),
    ...Object.keys(resourceModel.config?.files ?? {})
  ];
  for (const key of fields) {
    const name = extractResourceName(
      extractSchemaProperties(resourceModel.relationsModel, key) ??
        extractSchemaProperties(resourceModel.filesModel, key)
    );
    if (name) {
      names[key] = name;
    }
  }

  nestedModelsCache.set(cacheKey, names);
  return names;
}
