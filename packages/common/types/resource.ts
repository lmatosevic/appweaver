import { TObject } from '@sinclair/typebox';
import { Operation } from '@prisma/client/runtime/client';
import { ResourceModelConfig } from './model';
import { ResourceRoutesConfig, RouteSchema } from './routes';

export type Resource = {
  id: number;
  updatedAt?: Date;
  createdAt?: Date;
  createdById?: number;
};

export type ResourceData<T> = Omit<T, keyof Resource>;

export type ResourceClient = Record<Operation, any> & {
  name: string;
};

export type ResourceModel = {
  /** Model name in singular with the first capital letter (e.g., Model) */
  name: string;
  /** Received model config from default export */
  config: ResourceModelConfig;
  /** Full resource model with all configured fields (scalars, relations, files, and virtual) */
  readModel: TObject;
  /** Internal use only */
  createModel: TObject;
  /** Internal use only */
  updateModel: TObject;
  /** Internal use only */
  relationsModel: TObject;
  /** Internal use only */
  virtualModel: TObject;
  /** Response for file routes */
  filesModel: TObject;
  /** Response for find, create, update, and delete routes */
  readOneModel: TObject;
  /** Response for query route */
  readManyModel: TObject;
  /** Request for create route */
  createOneModel: TObject;
  /** Request for update route */
  updateOneModel: TObject;
  /** Request for file upload route */
  fileUploadModel: TObject;
  /** Request for file delete route */
  fileDeleteModel: TObject;
};

export type ResourceSchemaConfig = {
  /** Schema for finding one or more resources */
  findSchema: RouteSchema;
  /** Schema for querying resources based on specific criteria */
  querySchema: RouteSchema;
  /** Schema for aggregation operations on resources */
  aggregateSchema: RouteSchema;
  /** Schema for creating a new resource */
  createSchema: RouteSchema;
  /** Schema for updating an existing resource */
  updateSchema: RouteSchema;
  /** Schema for deleting a resource */
  deleteSchema: RouteSchema;
  /** Schema for exporting resource data */
  exportSchema: RouteSchema;
  /** Schema for handling file uploads related to a resource */
  fileUploadSchema: RouteSchema;
  /** Schema for handling file deletions related to a resource */
  fileDeleteSchema: RouteSchema;
};

export type ResourceRoutes = {
  /** Configuration for route definitions and behavior */
  config: ResourceRoutesConfig;
  /** Schema definitions for request/response validation of each route */
  schema: ResourceSchemaConfig;
  /** Function to register routes with the server instance */
  handler: (server: any) => void;
};
