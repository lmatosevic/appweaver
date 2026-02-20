import { ResourceModelSchema, ResourcePolicyConfig } from '@appweaver/common';
import { Server } from './server';
import { ResourceRoute } from './route';
import { ResourceService } from '../resource';

export type DefinitionValue =
  | Object
  | ((...args: any[]) => any)
  | Record<string, any>;

export type ApplicationContext = {
  server: Server | null;
  models: Record<string, ResourceModelSchema>;
  services: Record<string, ResourceService>;
  policies: Record<string, ResourcePolicyConfig>;
  routes: Record<string, ResourceRoute>;
  definitions: Record<string, DefinitionValue>;
};
