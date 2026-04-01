import { DatabaseType } from '../enums';
import { IHealthCheck, OnDestroy, OnInit } from '../interfaces';
import { HEALTH_CHECK, LIFECYCLE } from '../constants';

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

/**
 * Checks if the given value is an array.
 *
 * @param val - The value to check.
 * @return Returns true if the value is an array, otherwise false.
 */
export function isArray<T = any>(val: any): val is Array<T> {
  return Array.isArray(val);
}

/**
 * Checks if the given value is of a type object.
 *
 * @param value - The value to be checked.
 * @return A boolean indicating whether the value is an object.
 */
export function isObject(value: any): value is object {
  return typeof value === 'object';
}

/**
 * Checks if the given value is a function.
 *
 * @param value The value to be checked.
 * @return Returns true if the value is a function; otherwise, returns false.
 */
export function isFunction(value: any): value is FunctionType {
  return typeof value === 'function';
}

/**
 * Checks if the given value is a valid number.
 *
 * @param value - The value to be checked.
 * @return True if the value is a valid number, otherwise false.
 */
export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Checks if the given value is of type string.
 *
 * @param value - The value to check.
 * @return A boolean indicating whether the value is a string.
 */
export function isString(value: any): value is string {
  return typeof value === 'string';
}

/**
 * Determines whether the given value is of type symbol.
 *
 * @param value The value to check.
 * @return A boolean indicating whether the value is a symbol.
 */
export function isSymbol(value: any): value is symbol {
  return typeof value === 'symbol';
}

/**
 * Determines if the provided value is of a boolean type.
 *
 * @param value - The value to be checked.
 * @return Returns `true` if the value is a boolean, otherwise `false`.
 */
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
 * @param {Object} value - The value to check.
 * @return {boolean} Returns true if the value implements `IHealthCheck` interface, otherwise false.
 */
export function isHealthCheck(value: any): value is IHealthCheck {
  return hasTagAndFunction(value, HEALTH_CHECK, 'checkHealth');
}

/**
 * Determines if the given value is an instance that implements `OnInit` interface.
 * The tested value must also have a `LIFECYCLE` symbol with truthy value added.
 *
 * @param {Object} value - The value to check.
 * @return {boolean} Returns true if the value implements `OnInit` interface, otherwise false.
 */
export function isLifecycleInit(value: any): value is OnInit {
  return hasTagAndFunction(value, LIFECYCLE, 'onInit');
}

/**
 * Determines if the given value is an instance that implements the `OnDestroy` interface.
 * The tested value must also have a `LIFECYCLE` symbol with truthy value added.
 *
 * @param {Object} value - The value to check.
 * @return {boolean} Returns true if the value implements `OnDestroy` interface, otherwise false.
 */
export function isLifecycleDestroy(value: any): value is OnDestroy {
  return hasTagAndFunction(value, LIFECYCLE, 'onDestroy');
}

/**
 * Resolves the database type based on the given type or the database URL. If a database type is explicitly set,
 * it is returned. Otherwise, the type is inferred from the url argument prefix. Possible database types include
 * PostgresSQL, MySQL, SQLServer, and Sqlite.
 *
 * @param {DatabaseType} [type] - The explicit database type provided.
 * @param {string} [url] - The database connection URL used to infer the type if not explicitly set.
 * @return {DatabaseType} The resolved database type, either from the provided type or inferred from the URL.
 */
export function resolveDatabaseType(
  type?: DatabaseType,
  url?: string
): DatabaseType {
  if (type) {
    return type;
  }

  if (url?.startsWith('postgresql:')) {
    return DatabaseType.PostgresSQL;
  }

  if (url?.startsWith('mysql:') || url?.startsWith('mariadb:')) {
    return DatabaseType.MySQL;
  }

  if (url?.startsWith('sqlserver:')) {
    return DatabaseType.SQLServer;
  }

  return DatabaseType.Sqlite;
}

function hasTagAndFunction(
  value: any,
  tag: string | symbol,
  methodName: string
): boolean {
  return (
    ((value.constructor?.[tag] || value[tag]) &&
      isFunction(value[methodName])) ||
    (value.prototype?.constructor?.[tag] &&
      isFunction(value.prototype[methodName]))
  );
}
