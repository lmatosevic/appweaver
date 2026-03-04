import { ResourcePolicyConfig } from '@appweaver/common';
import { Server } from './server';
import { ResourceRoutes } from './route';
import { ResourceModel } from './resource';
import { IResourceService } from './resource-service';

export type Ctor<T = any> = { new (...args: any[]): T };

export type DefinitionMode = 'ignore' | 'append' | 'override';

export type DefinitionClass<T = any> = abstract new (
  ...args: any[]
) => T | Ctor;

export type DefinitionValue =
  | object
  | ((...args: any[]) => any)
  | Record<string, any>;

export type DefinitionEntry = { name: string | symbol; value: DefinitionValue };

export type ResourceContext = {
  models: Map<string | symbol, ResourceModel>;
  services: Map<string | symbol, IResourceService>;
  policies: Map<string | symbol, ResourcePolicyConfig>;
  routes: Map<string | symbol, ResourceRoutes>;
};

export type ApplicationContext = {
  server: Server | null;
  resource: ResourceContext;
  definitions: DefinitionEntry[];
};
