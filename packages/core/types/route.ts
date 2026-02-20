import { ResourceRoutesConfig } from '@appweaver/common';
import { ServerInstance } from './serverInstance';

export type ResourceSchema = Record<string, any>;

export type ResourceSchemaConfig = {
  findSchema: ResourceSchema;
  querySchema: ResourceSchema;
  aggregateSchema: ResourceSchema;
  createSchema: ResourceSchema;
  updateSchema: ResourceSchema;
  deleteSchema: ResourceSchema;
  exportSchema: ResourceSchema;
  fileUploadSchema: ResourceSchema;
  fileDeleteSchema: ResourceSchema;
};

export type RouteHandler = (server: ServerInstance) => void;

export type ResourceRoute = {
  config: ResourceRoutesConfig;
  schema: ResourceSchema;
  handler: RouteHandler;
};
