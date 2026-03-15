import { AuthType } from '../enums';

export type RouteConfig = {
  exclude?: boolean;
  public?: boolean;
  roles?: string[];
  permissions?: string[];
  auth?: (string | AuthType)[];
  rateLimit?:
    | false
    | {
        max?:
          | number
          | ((req: any, key: string) => number)
          | ((req: any, key: string) => Promise<number>);
        timeWindow?:
          | number
          | string
          | ((req: any, key: string) => number)
          | ((req: any, key: string) => Promise<number>);
        allowList?:
          | string[]
          | ((req: any, key: string) => boolean | Promise<boolean>);
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
