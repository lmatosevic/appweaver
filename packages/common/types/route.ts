import { AuthType } from '../enums';

export type RouteRateLimitFn =
  | ((req: any, key: string) => Promise<number>)
  | ((req: any, key: string) => number);

export type RouteConfig = {
  exclude?: boolean;
  public?: boolean;
  roles?: string[];
  permissions?: string[];
  auth?: (string | AuthType)[];
  rateLimit?:
    | false
    | {
        max?: number | RouteRateLimitFn;
        timeWindow?: number | string | RouteRateLimitFn;
        allowList?:
          | string[]
          | ((req: any, key: string) => boolean | Promise<boolean>);
        keyGenerator?: (req: any) => string | number | Promise<string | number>;
      };
};

export type RouteCacheConfig = {
  cache?: boolean;
  cacheKey?: string | ((req: any, user: any) => string);
  cacheTTL?: number;
  cacheSkipInvalidation?: boolean;
  cacheModelName?: string;
  cacheRelations?: string[];
};

export type ResourceRoutesConfig = {
  modelName: string;
  path?: string;
  find?: RouteConfig &
    Omit<RouteCacheConfig, 'cacheKey' | 'cacheModelName' | 'cacheRelations'>;
  query?: RouteConfig &
    Omit<RouteCacheConfig, 'cacheKey' | 'cacheModelName' | 'cacheRelations'>;
  aggregate?: RouteConfig &
    Omit<RouteCacheConfig, 'cacheKey' | 'cacheModelName' | 'cacheRelations'>;
  create?: RouteConfig;
  update?: RouteConfig;
  delete?: RouteConfig;
  export?: RouteConfig;
  fileUpload?: RouteConfig;
  fileDelete?: RouteConfig;
};
