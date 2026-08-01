import {
  defaultScalarValue,
  extractResourceName,
  extractSchemaProperties,
  isArray,
  isFunction,
  isObject
} from '@appweaver/common';
import { injectModel } from '../context';

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
  const relationsModel = resourceModel?.relationsModel;
  const filesModel = resourceModel?.filesModel;

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
  for (const key in projectedVirtual) {
    const value = projectedVirtual[key];

    const relationSchema = extractSchemaProperties(relationsModel, key);
    const fileSchema = extractSchemaProperties(filesModel, key);

    if (isObject(value) || (isArray(value) && isObject(value[0]))) {
      const nestedResourceName = extractResourceName(
        relationSchema ?? fileSchema
      );
      if (nestedResourceName) {
        projectedVirtual[key] = isArray(value)
          ? (value.map((item: any) =>
              projectVirtualFields(item, nestedResourceName)
            ) as any)
          : projectVirtualFields(value, nestedResourceName);
      }
    }
  }

  return projectedVirtual;
}
