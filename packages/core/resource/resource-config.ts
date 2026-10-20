import { Type } from '@sinclair/typebox';
import { appConfig, defineConfig, QueryMethod } from '@appweaver/common';

export const resourceConfig = defineConfig(
  'resource',
  {
    /** Glob pattern for resource model files. Default: `'<srcPath>/resources/"*"/*model.ts'`. */
    MODEL_PATTERN: Type.String({
      default: '<srcPath>/resources/*/*model.ts'
    }),
    /** Glob pattern for resource service files. Default: `'<srcPath>/resources/"*"/*service.ts'`. */
    SERVICE_PATTERN: Type.String({
      default: '<srcPath>/resources/*/*service.ts'
    }),
    /** Glob pattern for resource policy files. Default: `'<srcPath>/resources/"*"/*policy.ts'`. */
    POLICY_PATTERN: Type.String({
      default: '<srcPath>/resources/*/*policy.ts'
    }),
    /** Glob pattern for resource routes files. Default: `'<srcPath>/resources/"*"/*routes.ts'`. */
    ROUTES_PATTERN: Type.String({
      default: '<srcPath>/resources/*/*routes.ts'
    }),
    /** Output path for generated TypeScript types. Default: `'<srcPath>/types/generated.ts'`. */
    GENERATED_TYPES_PATH: Type.String({
      default: '<srcPath>/types/generated.ts'
    }),
    /** HTTP methods of the resource query routes. Values: `post`, `get`, `get-post`. Default: `'post'`. */
    QUERY_METHOD: Type.Enum(QueryMethod, {
      default: QueryMethod.Post
    }),
    /** HTTP methods of the resource aggregate routes. Values: `post`, `get`, `get-post`. Default: `'post'`. */
    AGGREGATE_METHOD: Type.Enum(QueryMethod, {
      default: QueryMethod.Post
    }),
    /** Register the bulk create route of every resource, unless its route sets `exclude`. Default: `false`. */
    BULK_CREATE_ENABLED: Type.Boolean({ default: false }),
    /** Register the bulk update routes of every resource, unless its route sets `exclude`. Default: `false`. */
    BULK_UPDATE_ENABLED: Type.Boolean({ default: false }),
    /** Register the bulk delete route of every resource, unless its route sets `exclude`. Default: `false`. */
    BULK_DELETE_ENABLED: Type.Boolean({ default: false }),
    /** Maximum number of items a bulk create, update, or delete request accepts, unless its route sets `maxItems`.
     * Default: `2000`. */
    BULK_MAX_ITEMS: Type.Integer({ default: 2000, minimum: 1 }),
    /** Timeout in milliseconds of the transaction a bulk request runs in. Default: `5000`. */
    BULK_TRANSACTION_TIMEOUT: Type.Integer({ default: 5000 }),
    /** Respond to a bulk request with the records it applied, the same as their single routes, or only with
     * `{ success, count }` when `false`, unless its route sets `returnRecords`. Default: `true`. */
    BULK_RETURN_RECORDS: Type.Boolean({ default: true })
  },
  {
    // The path patterns are relative to the source directory of the application
    transform: (values) => {
      const withSource = (path: string) =>
        path.replace('<srcPath>', appConfig.SOURCE_PATH);
      return {
        ...values,
        MODEL_PATTERN: withSource(values.MODEL_PATTERN),
        SERVICE_PATTERN: withSource(values.SERVICE_PATTERN),
        POLICY_PATTERN: withSource(values.POLICY_PATTERN),
        ROUTES_PATTERN: withSource(values.ROUTES_PATTERN),
        GENERATED_TYPES_PATH: withSource(values.GENERATED_TYPES_PATH)
      };
    }
  }
);
