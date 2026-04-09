import {
  AbstractCtor,
  Ctor,
  IResourceService,
  ResourceModel,
  ResourcePolicyConfig,
  ResourceRoutes
} from '@appweaver/common';
import { Server } from './server';

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

export type ApplicationContext = {
  server: Server | null;
  resource: ResourceContext;
  definitions: DefinitionEntry[];
};
