import {
  AbstractCtor,
  Ctor,
  IResourceService,
  ResourceModel,
  ResourcePolicyConfig,
  ResourceRoutes
} from '@appweaver/common';

export type DefinitionMode = 'ignore' | 'append' | 'override' | 'fail';

export type DefinitionClass<T = any> = AbstractCtor<T> | Ctor<T>;

export type DefinitionValue =
  | object
  | ((...args: any[]) => any)
  | Record<string, any>;

export type DefinitionEntry = { name: string | symbol; value: DefinitionValue };

export type ResourceContext = {
  models: Map<string | symbol, ResourceModel>;
  services: Map<string | symbol, IResourceService | Ctor<IResourceService>>;
  policies: Map<string | symbol, ResourcePolicyConfig>;
  routes: Map<string | symbol, ResourceRoutes>;
};

export type ModuleContext = {
  /** The name of the provider selected for each contract, keyed by the contract name. */
  providers: Map<string, string>;
};

export type ApplicationContext = {
  resource: ResourceContext;
  modules: ModuleContext;
  definitions: DefinitionEntry[];
};
