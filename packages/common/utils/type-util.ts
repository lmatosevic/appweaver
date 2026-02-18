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

export function isArray<T = any>(variable: any): variable is Array<T> {
  return Array.isArray(variable);
}

export function isObject(variable: any): variable is object {
  return typeof variable === 'object';
}

export function isFunction(variable: any): variable is Function {
  return typeof variable === 'function';
}

export function isNumber(variable: any): variable is number {
  return typeof variable === 'number' && !isNaN(variable);
}

export function isString(variable: any): variable is string {
  return typeof variable === 'string';
}

export function isBoolean(variable: any): variable is boolean {
  return typeof variable === 'boolean';
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
