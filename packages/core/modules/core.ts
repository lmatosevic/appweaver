import {
  Cache,
  defineModule,
  Events,
  Mailer,
  Memory,
  Queue,
  Scheduler,
  SecurityStore,
  Storage,
  TemplateEngine
} from '@appweaver/common';
import { cacheConfig } from '../cache/cache-config';
import { eventsConfig } from '../events/events-config';
import { mailerConfig } from '../mailer/mailer-config';
import { memoryConfig } from '../memory/memory-config';
import { queueConfig } from '../queue/queue-config';
import { schedulerConfig } from '../scheduler/scheduler-config';
import { securityStoreConfig } from '../security/security-store-config';
import { storageConfig } from '../storage/storage-config';
import { templateConfig } from '../template/template-config';

/** The runtime every application has, with the in-process drivers the `auto` providers fall back to. */
export default defineModule({
  name: '@appweaver/core',
  contracts: [
    { contract: Memory, provider: () => memoryConfig.PROVIDER },
    { contract: Cache, provider: () => cacheConfig.PROVIDER },
    { contract: Events, provider: () => eventsConfig.PROVIDER },
    { contract: Storage, provider: () => storageConfig.PROVIDER },
    { contract: SecurityStore, provider: () => securityStoreConfig.PROVIDER },
    { contract: Queue, provider: () => queueConfig.PROVIDER },
    { contract: Mailer, provider: () => mailerConfig.PROVIDER },
    { contract: TemplateEngine, provider: () => templateConfig.PROVIDER },
    { contract: Scheduler, provider: () => schedulerConfig.PROVIDER }
  ],
  providers: [
    {
      contract: Memory,
      name: 'memory',
      load: () => import('../memory/in-memory'),
      auto: 'fallback'
    },
    {
      contract: Cache,
      name: 'memory',
      load: () => import('../cache/memory-cache'),
      auto: 'fallback'
    },
    {
      contract: Events,
      name: 'node',
      load: () => import('../events/node-events'),
      auto: 'fallback'
    },
    {
      contract: Storage,
      name: 'local',
      load: () => import('../storage/filesystem-storage'),
      auto: 'fallback'
    },
    {
      contract: SecurityStore,
      name: 'memory',
      load: () => import('../security/store/memory-security-store'),
      auto: false
    },
    {
      contract: Queue,
      name: 'memory',
      load: () => import('../queue/memory-queue'),
      auto: 'fallback'
    },
    {
      contract: Mailer,
      name: 'json',
      load: () => import('../mailer/json-mailer'),
      auto: false
    }
  ],
  services: [
    { load: () => import('../locale/locale-service') },
    { load: () => import('../cache/cache-service'), requires: [Cache] },
    {
      load: () => import('../mailer/email-service'),
      requires: [Mailer, Queue]
    },
    { load: () => import('../health/health-service') },
    { load: () => import('../health/health-listener') }
  ]
});
