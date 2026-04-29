import { AuthType } from '../enums';

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
} & {
  [key: `x-${string}`]: any;
};

export type RouteRateLimitFn =
  | ((req: any, key: string) => Promise<number>)
  | ((req: any, key: string) => number);

export type RateLimitConfig =
  | false
  | {
      /** Maximum number of requests allowed per window */
      max?: number | RouteRateLimitFn;
      /** Duration of the rate limit window */
      timeWindow?: number | string | RouteRateLimitFn;
      /** IPs or keys exempt from rate limiting */
      allowList?:
        | string[]
        | ((req: any, key: string) => boolean | Promise<boolean>);
      /** Custom function to derive the rate limit key from the request */
      keyGenerator?: (req: any) => string | number | Promise<string | number>;
    };

export type RecaptchaConfig = {
  /** Enable reCAPTCHA verification for this route. reCAPTCHA for this route can
   * also be enabled if the `recaptchaAction ` value is provided */
  recaptcha?: boolean;
  /** reCAPTCHA action name for score validation */
  recaptchaAction?: string;
};

export type RouteConfig = {
  /** Remove this route from registration */
  exclude?: boolean;
  /** Allow unauthenticated access. If any of the `auth`, `roles` or
   * `permissions` properties are set, they will be ignored. */
  public?: boolean;
  /** Roles required to access this route */
  roles?: string[];
  /** Permissions required to access this route */
  permissions?: string[];
  /** Accepted authentication strategies */
  auth?: (string | AuthType)[];
  /** Rate limit configuration for this route */
  rateLimit?: RateLimitConfig;
} & RecaptchaConfig;

export type RouteCacheConfig = {
  /** Enable or disable response caching. Caching for this route can also be
   * enabled if `cacheKey` or `cacheTTL` value is provided */
  cache?: boolean;
  /** Custom cache key or factory */
  cacheKey?: string | ((req: any, user: any) => string);
  /** Cache TTL in seconds */
  cacheTTL?: number;
  /** Skip automatic cache invalidation */
  cacheSkipInvalidation?: boolean;
  /** Model name used to scope cache invalidation */
  cacheModelName?: string;
  /** Related model names that trigger cache invalidation */
  cacheRelations?: string[];
};

export type ReadRouteConfig = RouteConfig &
  Omit<RouteCacheConfig, 'cacheKey' | 'cacheModelName' | 'cacheRelations'>;

export type ResourceRoutesConfig = {
  /** Resource model name */
  modelName: string;
  /** URL path prefix for this resource */
  path?: string;
  /** Config for the find-by-ID route */
  find?: ReadRouteConfig;
  /** Config for the list/query route */
  query?: ReadRouteConfig;
  /** Config for the aggregate route */
  aggregate?: ReadRouteConfig;
  /** Config for the create route */
  create?: RouteConfig;
  /** Config for the update route */
  update?: RouteConfig;
  /** Config for the delete route */
  delete?: RouteConfig;
  /** Config for the export route */
  export?: RouteConfig;
  /** Config for the file upload route */
  fileUpload?: RouteConfig;
  /** Config for the file delete route */
  fileDelete?: RouteConfig;
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
