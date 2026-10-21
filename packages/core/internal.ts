/**
 * The internals of the runtime the framework packages build on: the application context, the transaction scope, the
 * lifecycle of the services and the provider loading. A module package may use them, but they can change in a minor
 * release, so it declares the `framework` range it supports.
 */
export { context } from './context/context';
export * from './context/transaction-scope';
export { LifecycleManager } from './app/lifecycle-manager';
export { loadProviders } from './app/load-providers';
