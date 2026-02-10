import {
  ResourceModelSchema,
  ResourcePolicyConfig,
  ResourceRoutesConfig
} from '@appweaver/common';
import { ResourceService } from '../resource';
import { RouteHandler, ServerInstance } from '../types';

export type Context = {
  server: ServerInstance | null;
  models: Record<string, ResourceModelSchema>;
  services: Record<string, ResourceService>;
  policies: Record<string, ResourcePolicyConfig>;
  routes: Record<
    string,
    { config: ResourceRoutesConfig; handler: RouteHandler }
  >;
};

export const context: Context = {
  server: null,
  models: {},
  services: {},
  policies: {},
  routes: {}
};
