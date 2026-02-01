import { ResourceService } from '../resource';
import { ResourceConfig, RouteHandler, ServerInstance } from '../types';

export type Context = {
  server: ServerInstance | null;
  resources: Record<string, ResourceConfig>;
  routes: Record<string, RouteHandler>;
  services: Record<string, ResourceService<any>>;
};

export const context: Context = {
  server: null,
  resources: {},
  routes: {},
  services: {}
};
