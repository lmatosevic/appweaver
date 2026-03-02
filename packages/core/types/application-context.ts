import { ResourcePolicyConfig } from '@appweaver/common';
import { Server } from './server';
import { ResourceRoutes } from './route';
import { ResourceModel } from './resource';
import { IResourceService } from './resource-service';

export type DefinitionMode = 'ignore' | 'append' | 'override';

export type DefinitionClass<T = void> = abstract new (
  ...args: any[]
) => T | { new (...args: any[]): T };

export type DefinitionValue =
  | object
  | ((...args: any[]) => any)
  | Record<string, any>;

export type DefinitionEntry = { name: string; value: DefinitionValue };

export type ResourceContext = {
  models: Record<string, ResourceModel>;
  services: Record<string, IResourceService>;
  policies: Record<string, ResourcePolicyConfig>;
  routes: Record<string, ResourceRoutes>;
};

export type ApplicationContext = {
  server: Server | null;
  resource: ResourceContext;
  definitions: DefinitionEntry[];
};
