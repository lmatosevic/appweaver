import {
  AbstractCtor,
  Ctor,
  Module,
  IResourceService,
  ResourceModel,
  ResourcePolicyConfig,
  ResourceRoutes
} from '@appweaver/common';

export type DefinitionMode =
  | 'ignore'
  | 'append'
  | 'override'
  | 'fail'
  | 'default';

export type DefinitionClass<T = any> = AbstractCtor<T> | Ctor<T>;

export type DefinitionValue =
  | object
  | ((...args: any[]) => any)
  | Record<string, any>;

export type DefinitionEntry = {
  name: string | symbol;
  value: DefinitionValue;
  /** A default of a module, which any later definition under its name replaces. */
  fallback?: boolean;
};

export type ResourceContext = {
  models: Map<string | symbol, ResourceModel>;
  services: Map<string | symbol, IResourceService | Ctor<IResourceService>>;
  policies: Map<string | symbol, ResourcePolicyConfig>;
  routes: Map<string | symbol, ResourceRoutes>;
  /** The extensions of the models, services, policies and routes of `extendModel`, `extendService`, `extendPolicy`
   * and `extendRoutes`, by kind and model name, applied once every resource is loaded. */
  extensions?: Map<ResourceExtensionKind, Map<string, ResourceExtension[]>>;
};

/** The kind of resource an extension extends. */
export type ResourceExtensionKind = 'model' | 'service' | 'policy' | 'routes';

/** An extension of a resource, with the file it was declared in. */
export type ResourceExtension<T = unknown> = {
  config: T;
  source?: string;
};

export type ModuleContext = {
  /** The enabled modules, in their load order. */
  enabled: Module[];
  /** The name of the provider selected for each contract, keyed by the contract name. */
  providers: Map<string, string>;
};

export type ApplicationContext = {
  resource: ResourceContext;
  modules: ModuleContext;
  definitions: DefinitionEntry[];
};
