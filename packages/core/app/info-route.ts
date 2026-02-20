import { config } from '@appweaver/common';
import { infoSchema } from './info-schema';
import { Server } from '../types';

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
      name: config.APP_NAME,
      version: config.APP_VERSION
    })
  );
}
