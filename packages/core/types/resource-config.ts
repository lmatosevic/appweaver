import { RouteConfig } from './route-config';
import { CacheConfig } from './cache-config';

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
