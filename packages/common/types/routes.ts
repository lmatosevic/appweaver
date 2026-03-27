import { AuthType } from '../enums';

export type RouteRateLimitFn =
  | ((req: any, key: string) => Promise<number>)
  | ((req: any, key: string) => number);

export type RateLimitConfig =
  | false
  | {
      max?: number | RouteRateLimitFn;
      timeWindow?: number | string | RouteRateLimitFn;
      allowList?:
        | string[]
        | ((req: any, key: string) => boolean | Promise<boolean>);
      keyGenerator?: (req: any) => string | number | Promise<string | number>;
    };

export type RecaptchaConfig = {
  recaptcha?: boolean;
  recaptchaAction?: string;
};

export type RouteConfig = {
  exclude?: boolean;
  public?: boolean;
  roles?: string[];
  permissions?: string[];
  auth?: (string | AuthType)[];
  rateLimit?: RateLimitConfig;
} & RecaptchaConfig;

export type RouteCacheConfig = {
  cache?: boolean;
  cacheKey?: string | ((req: any, user: any) => string);
  cacheTTL?: number;
  cacheSkipInvalidation?: boolean;
  cacheModelName?: string;
  cacheRelations?: string[];
};

export type ReadRouteConfig = RouteConfig &
  Omit<RouteCacheConfig, 'cacheKey' | 'cacheModelName' | 'cacheRelations'>;

export type ResourceRoutesConfig = {
  modelName: string;
  path?: string;
  find?: ReadRouteConfig;
  query?: ReadRouteConfig;
  aggregate?: ReadRouteConfig;
  create?: RouteConfig;
  update?: RouteConfig;
  delete?: RouteConfig;
  export?: RouteConfig;
  fileUpload?: RouteConfig;
  fileDelete?: RouteConfig;
};
