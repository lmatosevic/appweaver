export type RoutePathConfig = {
  resourcePaths: { name: string; basePath: string }[];
  routePrefixes: {
    api: string;
    static: string;
    health: string;
    auth: string;
    account: string;
    files: string;
  };
};

export type RouteType =
  | 'resource'
  | 'auth'
  | 'account'
  | 'health'
  | 'files'
  | 'custom';
