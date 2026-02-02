import { TObject } from '@sinclair/typebox';
import { RouteConfig } from './route-config';
import { CacheConfig } from './cache-config';
import { FileConfigProps } from './file-config';
import { RelationConfigProps } from './relation-config';
import { ExportConfigProps } from './export-config';

export type ResourceModelConfig<
  Model = any,
  Relations = unknown,
  Files = unknown
> = {
  readModel?: TObject;
  createModel?: TObject;
  updateModel?: TObject;
  relationModel?: TObject;
  fileModel?: TObject;
  relationConfig?: RelationConfigProps<Relations>;
  fileConfig?: FileConfigProps<Model, Files>;
  exportConfig?: ExportConfigProps<Model, Relations, Files>;
};

export type ResourceConfig<
  Model = any,
  Relations = unknown,
  Files = unknown
> = ResourceModelConfig<Model, Relations, Files> & {
  readOneModel?: TObject;
  readManyModel?: TObject;
  createOneModel?: TObject;
  updateOneModel?: TObject;
  fileUploadModel?: TObject;
  fileDeleteModel?: TObject;
};

export type ResourceSchemaConfig = {
  findSchema?: Record<string, any>;
  querySchema?: Record<string, any>;
  aggregateSchema?: Record<string, any>;
  createSchema?: Record<string, any>;
  updateSchema?: Record<string, any>;
  deleteSchema?: Record<string, any>;
  exportSchema?: Record<string, any>;
  fileUploadSchema?: Record<string, any>;
  fileDeleteSchema?: Record<string, any>;
};

export type ResourceRoutesConfig = {
  default?: RouteConfig;
  find?: RouteConfig & CacheConfig;
  query?: RouteConfig & CacheConfig;
  aggregate?: RouteConfig & CacheConfig;
  create?: RouteConfig;
  update?: RouteConfig;
  delete?: RouteConfig;
  export?: RouteConfig;
  fileUpload?: RouteConfig;
  fileDelete?: RouteConfig;
};
