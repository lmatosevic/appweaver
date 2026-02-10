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
