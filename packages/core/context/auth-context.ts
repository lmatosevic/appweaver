import { AsyncLocalStorage } from 'node:async_hooks';
import { AuthSource, AuthType, AuthUser } from '@appweaver/common';

/** The authenticated user of the current call, i.e. of an HTTP request or of a job run with {@link runAs}. */
export type AuthContext = {
  authUser: AuthUser | null;
  authType: AuthType | null;
  authSource: AuthSource | null;
  /** The API key the user authenticated with, when the auth type is `apiKey`. */
  apiKey: unknown;
};

const authStorage = new AsyncLocalStorage<AuthContext>();

/**
 * Retrieves the currently authenticated user of the current call.
 *
 * @return {AuthUser | null | undefined} The authenticated user object if available, null if no user is authenticated,
 * or undefined outside of an auth context, i.e. in a job not run with {@link runAs}.
 */
export function currentAuthUser(): AuthUser | null | undefined {
  return authStorage.getStore()?.authUser;
}

/**
 * Retrieves the authentication type of the current call.
 *
 * @return {AuthType | null | undefined} The authentication type if available; otherwise, null or undefined.
 */
export function currentAuthType(): AuthType | null | undefined {
  return authStorage.getStore()?.authType;
}

/**
 * Retrieves the authentication source of the current call.
 *
 * @return {AuthSource | null | undefined} The authentication source if available; otherwise, null or undefined.
 */
export function currentAuthSource(): AuthSource | null | undefined {
  return authStorage.getStore()?.authSource;
}

/**
 * Retrieves the API key the current user authenticated with.
 *
 * @return {T | null | undefined} The API key record, or null or undefined for another auth type.
 */
export function currentApiKey<T = unknown>(): T | null | undefined {
  return authStorage.getStore()?.apiKey as T | null | undefined;
}

/**
 * Sets the authenticated user of the current call, i.e. once a request is authenticated. Outside of an auth context
 * nothing is set.
 *
 * @param {Partial<AuthContext>} values - The values to set.
 */
export function setAuthContext(values: Partial<AuthContext>): void {
  const store = authStorage.getStore();
  if (store) {
    Object.assign(store, values);
  }
}

/**
 * Runs a function in a new auth context without an authenticated user, which {@link setAuthContext} then fills, i.e.
 * once per HTTP request.
 *
 * @param {Function} fn - The function to run.
 * @return {Object} The value returned by the function.
 */
export function runInAuthContext<T>(fn: () => T): T {
  return authStorage.run(
    { authUser: null, authType: null, authSource: null, apiKey: null },
    fn
  );
}

/**
 * Runs a function as the given user, so the resource policies apply to it the way they do to a request of that user,
 * i.e. in a queue worker or a scheduled job. The previous auth context is restored after the function.
 *
 * @example
 * await runAs(user, () => injectService('Order').query({}));
 *
 * @param {AuthUser | null} user - The user to run the function as, or null to run it without a user.
 * @param {Function} fn - The function to run.
 * @param {Partial<AuthContext>} [context={}] - The auth type and source of the user.
 * @return {Object} The value returned by the function.
 */
export function runAs<T>(
  user: AuthUser | null,
  fn: () => T,
  context: Partial<Omit<AuthContext, 'authUser'>> = {}
): T {
  return authStorage.run(
    {
      authType: null,
      authSource: null,
      apiKey: null,
      ...context,
      authUser: user
    },
    fn
  );
}
