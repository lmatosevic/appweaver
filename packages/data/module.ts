import {
  Database,
  defineModule,
  ImageProcessor,
  SecurityStore,
  Storage,
  TimeSeries
} from '@appweaver/common';
import { databaseConfig } from './database/database-config';
import { exportConfig } from './export/export-config';
import { resourceConfig } from './resource/resource-config';
import {
  apiKeyConfig,
  connectedAccountConfig,
  passwordConfig,
  systemConfig
} from './security/auth-config';
import { imageConfig } from './storage/image-config';
import { timescaleConfig } from './timeseries/timescale-config';

/** The database, the resources and the auth data model, built on Prisma. */
export default defineModule({
  name: '@appweaver/data',
  config: [
    databaseConfig,
    resourceConfig,
    exportConfig,
    imageConfig,
    passwordConfig,
    apiKeyConfig,
    connectedAccountConfig,
    systemConfig,
    timescaleConfig
  ],
  loggers: ['database', 'resource', 'storage', 'timeseries'],
  contracts: [
    { contract: Database, provider: () => databaseConfig.PROVIDER },
    { contract: ImageProcessor, provider: () => imageConfig.PROVIDER }
  ],
  providers: [
    {
      contract: Database,
      name: 'prisma',
      load: () => import('./database/prisma-database')
    },
    {
      contract: SecurityStore,
      name: 'database',
      load: () => import('./security/store/database-security-store'),
      auto: 'fallback'
    },
    {
      contract: TimeSeries,
      name: 'database',
      load: () => import('./timeseries/database-time-series'),
      auto: 'fallback'
    },
    {
      contract: TimeSeries,
      name: 'timescale',
      load: () => import('./timeseries/timescale-time-series'),
      auto: false
    }
  ],
  services: [
    {
      load: () => import('./storage/file-service'),
      requires: [Database, Storage]
    },
    { load: () => import('./export/export-service'), requires: [Database] }
  ],
  setup: async (context) =>
    (await import('./resource/load-data-resources')).loadDataResources(context),
  resources: () => import('./resources')
});
