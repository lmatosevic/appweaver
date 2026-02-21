import { ResourcePolicyConfig } from '@appweaver/common';
import { Server } from './server';
import { ResourceRoutes } from './route';
import { ResourceService } from '../resource';
import { ResourceModel } from '../types';

export type DefinitionValue =
  | Object
  | ((...args: any[]) => any)
  | Record<string, any>;

export type ApplicationContext = {
  server: Server | null;
  models: Record<string, ResourceModel>;
  services: Record<string, ResourceService>;
  policies: Record<string, ResourcePolicyConfig>;
  routes: Record<string, ResourceRoutes>;
  definitions: Record<string, DefinitionValue>;
};
