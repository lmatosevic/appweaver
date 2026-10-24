import { AbstractCtor } from '../utils/type-util';

export const MODULE = Symbol('Module');

/** Selects the driver of an enabled module for a contract, otherwise the fallback of core. */
export const PROVIDER_AUTO = 'auto';

/** Disables a contract, so nothing is defined for it. */
export const PROVIDER_NONE = 'none';

/** Imports a part of a module lazily, i.e. `() => import('./gcs-storage')`. */
export type ModuleLoader<T = unknown> = () => T | Promise<T>;

/** A contract implementation of a module, selected by its name in the provider key of the contract config. */
export type ModuleProvider = {
  /** The contract the driver implements, i.e. `Storage`. */
  contract: AbstractCtor;
  /** The name selecting the driver, i.e. `gcs`, also the name of its config subsection. */
  name: string;
  /** Imports the driver, a module exporting its class. */
  load: ModuleLoader;
  /**
   * How `auto` treats the driver: `true` selects it, `'fallback'` only when no other enabled driver implements the
   * contract, and `false` never, so it is selected only by its name. Default: `true`.
   */
  auto?: boolean | 'fallback';
};

/** A contract a module declares, with the config key selecting its provider. */
export type ModuleContract = {
  /** The contract, i.e. `Storage`. */
  contract: AbstractCtor;
  /** Reads the selected provider: `auto`, `none`, a provider name, or the module path of an implementation. */
  provider: () => string;
};

/** A class of a module defined at startup, with its lifecycle hooks and health checks. */
export type ModuleService = {
  /** Imports the service, a module exporting its class. */
  load: ModuleLoader;
  /** The contracts the service needs, which must all be provided for it to be defined. */
  requires?: AbstractCtor[];
};

/** The manifest of a module, the default export of its `module.ts` file. */
export type ModuleManifest = {
  /** The name of the module, its package name for a package module. */
  name: string;
  /** The supported Appweaver version range, i.e. `^2.0.0`, checked at startup. */
  framework?: string;
  /** The names of the modules that must be enabled with it. */
  requires?: string[];
  /** Its config sections, defined with `defineConfig`. */
  config?: object[];
  /** The contracts it declares, which the providers of every module implement. */
  contracts?: ModuleContract[];
  /** Its contract implementations. */
  providers?: ModuleProvider[];
  /** Its classes defined at startup. */
  services?: ModuleService[];
  /** Imports its models, resource services and policies, loaded only with a database. */
  resources?: ModuleLoader;
  /** Imports the code run at startup: scheduled jobs, queue workers, event listeners. */
  main?: ModuleLoader;
  /** Imports its resource routes, custom routes and server plugins, loaded only with a server. */
  web?: ModuleLoader;
  /** Imports its `weaver` subcommands. */
  commands?: ModuleLoader;
  /** The absolute path of its seeders directory. */
  seeders?: string;
  /** The absolute path of its translations directory, overridden by the translations of the application. */
  locales?: string;
  /** The absolute path of its templates directory, overridden by the templates of the application. */
  templates?: string;
};

/** A manifest returned by {@link defineModule}. */
export type Module = Readonly<ModuleManifest> & { readonly [MODULE]: true };

/**
 * Defines the manifest of a module: a package with the `appweaver.module` field in its `package.json`, or a local
 * module matching `app.modulesPattern` (`<srcPath>/modules/"*"/module.ts`). Every part of a module is imported
 * lazily, and only when it is used, i.e. a driver only when it is selected.
 *
 * @param {ModuleManifest} manifest - The manifest of the module.
 * @return {Module} The frozen manifest.
 */
export function defineModule(manifest: ModuleManifest): Module {
  return Object.freeze({ ...manifest, [MODULE]: true as const });
}

/**
 * Checks if a value is a module manifest defined with {@link defineModule}.
 *
 * @param {unknown} value - The value to check.
 * @return {boolean} `true` for a manifest.
 */
export function isModule(value: unknown): value is Module {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[MODULE] === true
  );
}
