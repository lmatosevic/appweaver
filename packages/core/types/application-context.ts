import {
  ResourceModelSchema,
  ResourcePolicyConfig,
  ResourceRoutesConfig
} from '@appweaver/common';
import { ServerInstance } from './server-instance';
import { RouteHandler } from './route-config';
import { ResourceService } from '../resource';

export type ApplicationContext = {
  server: ServerInstance | null;
  models: Record<string, ResourceModelSchema>;
  services: Record<string, ResourceService>;
  policies: Record<string, ResourcePolicyConfig>;
  routes: Record<
    string,
    { config: ResourceRoutesConfig; handler: RouteHandler }
  >;
};
