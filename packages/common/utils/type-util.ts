import { DatabaseType } from '../enums';
import { IHealthCheck } from '../interfaces';
import { config } from '../config';
import { HEALTH_CHECK } from '../constants';

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

export type ConditionalOptional<T extends boolean, R> = T extends false
  ? R | undefined
  : R;

export type Ctor<T = any> = { new (...args: any[]): T };

export type AbstractCtor<T = any> = abstract new (...args: any[]) => T;

export type FunctionType = (...args: unknown[]) => unknown;

export function isArray<T = any>(val: any): val is Array<T> {
  return Array.isArray(val);
}

export function isObject(value: any): value is object {
  return typeof value === 'object';
}

export function isFunction(value: any): value is FunctionType {
  return typeof value === 'function';
}

export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isSymbol(value: any): value is symbol {
  return typeof value === 'symbol';
}

export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Determines if the given value is a constructor function.
 *
 * @param value The value to be checked.
 * @return A boolean indicating whether the value is a constructor function.
 */
export function isConstructor(value: any): value is Ctor {
  return (
    isFunction(value) &&
    !!value.prototype &&
    value.prototype.constructor === value
  );
}

/**
 * Determines if the given value is an instance that implements `IHealthCheck` interface.
 * The tested value must also have a `HEALTH_CHECK` symbol with truthy value added.
 *
 * @param {any} value - The value to check.
 * @return {boolean} Returns true if the value implements `IHealthCheck` interface, otherwise false.
 */
export function isHealthCheck(value: any): value is IHealthCheck {
  return (
    ((value.constructor?.[HEALTH_CHECK] || value[HEALTH_CHECK]) &&
      isFunction((value as IHealthCheck).checkHealth)) ||
    (value.prototype?.constructor?.[HEALTH_CHECK] &&
      isFunction((value.prototype as IHealthCheck).checkHealth))
  );
}

/**
 * Determines the database type based on the configuration.
 *
 * @return {DatabaseType} The database type resolved from the configuration. If `DATABASE_TYPE` is explicitly set in the configuration,
 * it is returned. Otherwise, the type is inferred from the `DATABASE_URL` prefix. Possible database types include PostgresSQL, MySQL,
 * SQLServer, and Sqlite.
 */
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

  if (config.DATABASE_URL.startsWith('sqlserver:')) {
    return DatabaseType.SQLServer;
  }

  return DatabaseType.Sqlite;
}
