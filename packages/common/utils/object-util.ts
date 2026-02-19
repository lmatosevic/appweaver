import { isArray, isObject } from './type-util';

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

export function setProperties<T extends object = any>(
  obj: T,
  value: keyof T | undefined
): T {
  return Object.keys(obj).reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {} as T);
}

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

export function removeUndefined<T extends object = any>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined)
  );
}

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
