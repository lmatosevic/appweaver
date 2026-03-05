export type RouteConfig = {
  exclude?: boolean;
  public?: boolean;
  roles?: string[];
  permissions?: string[];
  auth?: any[];
  rateLimit?: false | { max: number; timeWindow?: number | string };
};

export type RouteCacheConfig = {
  cache?: boolean;
  cacheKey?: string | ((req: any, user: any) => string);
  cacheTTL?: number;
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
