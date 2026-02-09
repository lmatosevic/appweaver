import { ResourceModelSchema } from '@appweaver/common';
import { ResourceService } from '../resource';
import { RouteHandler, ServerInstance } from '../types';

export type Context = {
  server: ServerInstance | null;
  models: Record<string, ResourceModelSchema>;
  routes: Record<string, RouteHandler>;
  services: Record<string, ResourceService<any>>;
  policies: Record<string, any>;
};

export const context: Context = {
  server: null,
  models: {},
  routes: {},
  services: {},
  policies: {}
};
