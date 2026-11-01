export type RoutePathConfig = {
  resourcePaths: { name: string; basePath: string }[];
  routePrefixes: {
    api: string;
    static: string;
    health: string;
    auth: string;
    account: string;
    /** The prefix of the 2FA routes, `<account>/2fa` when missing. */
    twoFactor?: string;
    files: string;
  };
};

export type RouteType =
  | 'resource'
  | 'auth'
  | 'account'
  | 'twoFactor'
  | 'health'
  | 'files'
  | 'custom';
