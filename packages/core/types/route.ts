import { ResourceRoutesConfig } from '@appweaver/common';
import { Server } from './server';

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

export type RoutesHandler = (server: Server) => void;

export type ResourceRoutes = {
  config: ResourceRoutesConfig;
  schema: ResourceSchema;
  handler: RoutesHandler;
};
