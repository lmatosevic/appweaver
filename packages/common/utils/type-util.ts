import { DatabaseType } from '../enums';
import { config } from '../config';

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

export function isArray<T = any>(val: any): val is Array<T> {
  return Array.isArray(val);
}

export function isObject(value: any): value is object {
  return typeof value === 'object';
}

export function isFunction(value: any): value is Function {
  return typeof value === 'function';
}

export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

export function getDatabaseType(): DatabaseType {
  if (config.DATABASE_TYPE) {
    return config.DATABASE_TYPE;
  }

  if (config.DATABASE_URL.startsWith('postgresql:')) {
    return DatabaseType.PostgresSQL;
  }

  if (
    config.DATABASE_URL.startsWith('mysql:') ||
    config.DATABASE_URL.startsWith('mariadb:')
  ) {
    return DatabaseType.MySQL;
  }

  return DatabaseType.Sqlite;
}
