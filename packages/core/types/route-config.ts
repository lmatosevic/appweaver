import { ServerInstance } from './server-instance';

export type RouteConfig = {
  roles?: string[];
  permissions?: string[];
  auth?: any[];
  exclude?: boolean;
  public?: boolean;
};

export type RouteHandler = (server: ServerInstance) => void;
