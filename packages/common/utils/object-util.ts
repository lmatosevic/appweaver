import { isArray, isObject } from './type-util';

/**
 * Sets a value in a nested object at a specified path. If the path does not exist, it creates the necessary objects along the path.
 *
 * @param {Record<string, any>} obj - The object in which the value will be set.
 * @param {string} path - The string representation of the path to where the value should be set, with keys separated by dots.
 * @param {any} value - The value to set at the specified path.
 * @return {Record<string, any>} The updated object with the value set at the specified path.
 */
export function setValue(
  obj: Record<string, any>,
  path: string,
  value: any
): any {
  const keys = path.split('.');

  let current = obj;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (i === keys.length - 1) {
      current[key] = value;
    } else {
      current[key] = {};
      current = current[key];
    }
  }

  return obj;
}

/**
 * Updates the properties of an object by setting each property to a specified value.
 *
 * @param obj - The object whose properties will be updated.
 * @param value - The value to assign to each property of the object.
 * @return T A new object with all properties updated to the specified value.
 */
export function setProperties<T extends object = any>(
  obj: T,
  value: keyof T | undefined
): T {
  return Object.keys(obj).reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {} as T);
}

/**
 * Picks specified properties from an object and returns a new object containing only those properties.
 *
 * @param obj - The source object from which properties will be picked.
 * @param {[]} props - An array of property keys to pick from the source object.
 * @return A new object containing only the picked properties from the source object.
 */
export function pickProperties<T extends object = any>(
  obj: T,
  props: (keyof T)[]
): Partial<T> {
  return props.reduce((acc, key) => {
    if (key in obj) {
      acc[key] = obj[key];
    }
    return acc;
  }, {} as Partial<T>);
}

/**
 * Excludes specified properties from an object and returns a new object without them.
 *
 * @param obj - The source object from which properties will be omitted.
 * @param {[]} props - An array of property keys to omit from the object.
 * @return A new object excluding the specified properties.
 */
export function omitProperties<T extends object = any>(
  obj: T,
  props: (keyof T)[]
): Omit<T, keyof T> {
  return Object.keys(obj).reduce(
    (acc, key) => {
      if (!props.includes(key as keyof T)) {
        acc[key] = obj[key];
      }
      return acc;
    },
    {} as Omit<T, keyof T>
  );
}

/**
 * Removes all properties with `undefined` values from the given object.
 *
 * @param obj - The object from which properties with `undefined` values will be removed.
 * @return A new object with all `undefined` values removed.
 */
export function removeUndefined<T extends object = any>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined)
  );
}

/**
 * Checks whether a given object or its nested objects/arrays contain a property with the specified key and value.
 *
 * @param {Record<string, any>} data - The object or array to search through.
 * @param {string} key - The property key to look for.
 * @param {any} value - The property value to match.
 * @return {boolean} Returns true if the property exists and matches the value; otherwise, returns false.
 */
export function objectHasProperty(
  data: Record<string, any>,
  key: string,
  value: any
): boolean {
  if (isArray(data)) {
    for (const item of data) {
      if (objectHasProperty(item, key, value)) {
        return true;
      }
    }
    return false;
  }

  if (data && isObject(data)) {
    for (const [propKey, propValue] of Object.entries(data)) {
      if (propKey === key && propValue === value) {
        return true;
      }

      if (propValue && isObject(propValue)) {
        if (objectHasProperty(propValue, key, value)) {
          return true;
        }
      }
    }
  }

  return false;
}
