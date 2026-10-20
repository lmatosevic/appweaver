import {
  Cache,
  Database,
  Events,
  Mailer,
  Memory,
  Queue,
  Redis,
  Scheduler,
  SecurityStore,
  Storage,
  TemplateEngine
} from '@appweaver/common';
import { schedulerConfig } from '../scheduler/scheduler-config';
import { mailerConfig } from '../mailer/mailer-config';
import { queueConfig } from '../queue/queue-config';
import { templateConfig } from '../template/template-config';
import { securityStoreConfig } from '../security/security-config';
import { eventsConfig } from '../events/events-config';
import { cacheConfig } from '../cache/cache-config';
import { memoryConfig, redisConfig } from '../memory/memory-config';
import { storageConfig } from '../storage/storage-config';
import { databaseConfig } from '../database/database-config';
import { loadProvider } from '../context';

/**
 * Loads and registers the core and infrastructure service definitions.
 * This method initializes and sets up various service components, such as the
 * database, cache, queue system, mailer, storage, and authentication services, among others.
 *
 * @param {string} baseDir - The base directory containing the module files.
 */
export function loadProviders(baseDir: string): void {
  // Common infrastructure services
  loadProvider(baseDir, databaseConfig.PROVIDER, Database);
  loadProvider(baseDir, storageConfig.PROVIDER, Storage);
  loadProvider(baseDir, memoryConfig.PROVIDER, Memory);
  loadProvider(baseDir, cacheConfig.PROVIDER, Cache);
  loadProvider(baseDir, eventsConfig.PROVIDER, Events);
  loadProvider(baseDir, securityStoreConfig.PROVIDER, SecurityStore);
  loadProvider(baseDir, redisConfig.PROVIDER, Redis, false);
  if (templateConfig.PROVIDER) {
    loadProvider(baseDir, templateConfig.PROVIDER, TemplateEngine, false);
  }
  const queueLoaded = loadProvider(baseDir, queueConfig.PROVIDER, Queue, false);
  const mailerLoaded =
    mailerConfig.ENABLED &&
    loadProvider(baseDir, mailerConfig.PROVIDER, Mailer, false);
  if (schedulerConfig.ENABLED) {
    loadProvider(baseDir, schedulerConfig.PROVIDER, Scheduler, false);
  }

  // Core feature services
  if (mailerLoaded && queueLoaded) {
    loadProvider(__dirname, '../mailer/email-service', undefined, false);
  }
  loadProvider(__dirname, '../locale/locale-service');
  loadProvider(__dirname, '../cache/cache-service');
  loadProvider(__dirname, '../storage/file-service');
  loadProvider(__dirname, '../security/auth-service');
  loadProvider(__dirname, '../security/account/account-service');
  loadProvider(__dirname, '../security/oauth2/oauth2-service');
  loadProvider(__dirname, '../export/export-service');
  loadProvider(__dirname, '../health/health-service');
}
