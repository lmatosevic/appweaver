import { ResourceRoutesConfig } from '@appweaver/common';
import { Router, Server } from './server';

export type RoutesHandler = (server: Server) => void;

export type RouterHandler = (router: Router) => void;

export type RouteSchema = {
  tags?: string[];
  security?: any[];
  summary?: string;
  description?: string;
  consumes?: string[];
  body?: unknown;
  querystring?: unknown;
  params?: unknown;
  headers?: unknown;
  response?: unknown;
};

export type ResourceSchemaConfig = {
  findSchema: RouteSchema;
  querySchema: RouteSchema;
  aggregateSchema: RouteSchema;
  createSchema: RouteSchema;
  updateSchema: RouteSchema;
  deleteSchema: RouteSchema;
  exportSchema: RouteSchema;
  fileUploadSchema: RouteSchema;
  fileDeleteSchema: RouteSchema;
};

export type ResourceRoutes = {
  config: ResourceRoutesConfig;
  schema: ResourceSchemaConfig;
  handler: RoutesHandler;
};
