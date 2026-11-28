import { AsyncLocalStorage } from 'node:async_hooks';
import { isSystemCall } from '@appweaver/core';

const internalAccess = new AsyncLocalStorage<boolean>();

/**
 * Runs the given function with internal access, where the resource and file services skip the policies: the access
 * checks, the read and write restrictions, and the file access checks. Everything else, like the service hooks,
 * validation, events, and cache invalidation, still runs. Meant for the framework's own flows and trusted application
 * code, such as jobs and seeders, that act on behalf of the system rather than the requesting user.
 *
 * The internal access covers every call made while the function runs, including the ones made by the service hooks.
 *
 * @param {Function} fn - The function to run with internal access.
 * @return {Object} The value returned by the function.
 */
export function withoutPolicies<T>(fn: () => T): T {
  return internalAccess.run(true, fn);
}

/**
 * Checks whether the current call runs with internal access: started by {@link withoutPolicies}, or the application's
 * own call outside of a request and of `runAs` (`isSystemCall` of `@appweaver/core`).
 *
 * @return {boolean} True if the policies are skipped for the current call, otherwise false.
 */
export function arePoliciesSkipped(): boolean {
  return internalAccess.getStore() === true || isSystemCall();
}
