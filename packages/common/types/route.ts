export type RouteConfig = {
  exclude?: boolean;
  public?: boolean;
  roles?: string[];
  permissions?: string[];
  auth?: string[];
};

export type CacheConfig = {
  cacheDisabled?: boolean;
  cacheKey?: string;
  cacheTTL?: number;
};

export type ResourceRoutesConfig = {
  name: string;
  path?: string;
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
