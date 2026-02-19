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
