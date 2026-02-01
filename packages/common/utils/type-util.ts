export type BaseType<T> = T extends Array<infer I> ? I : T;

export type BaseTypeKey<T> = keyof BaseType<T>;

export type IsObject<T> =
  T extends Array<any>
    ? false
    : T extends Date
      ? false
      : T extends Uint8Array
        ? false
        : T extends bigint
          ? false
          : T extends object
            ? true
            : false;

export function isArray(variable: any): boolean {
  return Array.isArray(variable);
}

export function isObject(variable: any): boolean {
  return isTypeOf(variable, Object);
}

export function isTypeOf(variable: any, type: any): boolean {
  try {
    return variable.constructor === type;
  } catch (e) {
    return false;
  }
}
