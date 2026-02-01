import { Role } from './role';
import { ServerInstance } from './server-instance';

export type RouteConfig = {
  roles?: Role[];
  auth?: any[];
  exclude?: boolean;
  public?: boolean;
};

export type RouteHandler = (server: ServerInstance) => void;
