import { config, appConfig } from '@appweaver/common';
import { infoSchema } from './info-schema';
import { Server } from '../types/server';

/**
 * Registers the root route responding with the name and version of the application.
 *
 * @param {Server} server - The server to register the route on.
 */
export function info(server: Server): void {
  server.get(
    '/',
    {
      schema: infoSchema,
      config: {
        rateLimit: {
          max: 60
        }
      }
    },
    () => ({
      name: appConfig.NAME,
      version: appConfig.VERSION
    })
  );
}
