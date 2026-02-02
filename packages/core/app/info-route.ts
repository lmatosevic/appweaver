import { config } from '@appweaver/common';
import { infoSchema } from '../schema';
import { ServerInstance } from '../types';

export function info(server: ServerInstance): void {
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
      name: config.APP_NAME,
      version: config.APP_VERSION
    })
  );
}
