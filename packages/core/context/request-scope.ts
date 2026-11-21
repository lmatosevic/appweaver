import { AsyncLocalStorage } from 'node:async_hooks';
import { AuditSource } from '@appweaver/common';

/** What the audit log records of the call a change is made in, i.e. of an HTTP request. */
export type RequestScope = {
  /** Where the call came from. */
  source: AuditSource;
  /** The id of the audit log entry of the call, which the changes made in it belong to. */
  auditId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  /** The action of the call, i.e. `mcp.post_create` for a tool of the MCP server. */
  action?: string;
  /** Leave the call out of the audit log, its changes included. */
  excluded?: boolean;
};

const scopeStorage = new AsyncLocalStorage<RequestScope>();

/**
 * Retrieves the scope of the current call, set for every HTTP request.
 *
 * @return {RequestScope | undefined} The scope, or undefined outside of one, i.e. in a queue worker.
 */
export function currentRequestScope(): RequestScope | undefined {
  return scopeStorage.getStore();
}

/**
 * Runs a function in a new request scope, i.e. once per HTTP request, or for a task to record its changes under its
 * own source. The scope is the object given, which {@link setRequestScope} changes.
 *
 * @example
 * await runInRequestScope({ source: 'job', action: 'import.products' }, () => importProducts());
 *
 * @param {RequestScope} scope - The scope.
 * @param {Function} fn - The function to run.
 * @return {Object} The value returned by the function.
 */
export function runInRequestScope<T>(scope: RequestScope, fn: () => T): T {
  return scopeStorage.run(scope, fn);
}

/**
 * Changes the scope of the current call. Outside of a scope nothing is set.
 *
 * @param {Partial<RequestScope>} values - The values to set.
 */
export function setRequestScope(values: Partial<RequestScope>): void {
  const scope = scopeStorage.getStore();
  if (scope) {
    Object.assign(scope, values);
  }
}
