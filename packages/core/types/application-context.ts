import { ResourcePolicyConfig } from '@appweaver/common';
import { Server } from './server';
import { ResourceRoutes } from './route';
import { ResourceModel } from './resource';
import { IResourceService } from './resource-service';

export type DefinitionValue =
  | object
  | ((...args: any[]) => any)
  | Record<string, any>;

export type DefinitionEntry = { name: string; value: DefinitionValue };

export type ApplicationContext = {
  server: Server | null;
  models: Record<string, ResourceModel>;
  services: Record<string, IResourceService>;
  policies: Record<string, ResourcePolicyConfig>;
  routes: Record<string, ResourceRoutes>;
  definitions: DefinitionEntry[];
};
