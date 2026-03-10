import {
  Cache,
  config,
  Database,
  Events,
  Mailer,
  Memory,
  Queue,
  Redis,
  Scheduler,
  Storage
} from '@appweaver/common';
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
  loadProvider(baseDir, config.DATABASE_PROVIDER, Database);
  loadProvider(baseDir, config.STORAGE_PROVIDER, Storage);
  loadProvider(baseDir, config.MEMORY_PROVIDER, Memory);
  loadProvider(baseDir, config.CACHE_PROVIDER, Cache);
  loadProvider(baseDir, config.EVENTS_PROVIDER, Events);
  loadProvider(baseDir, config.REDIS_PROVIDER, Redis, false);
  loadProvider(baseDir, config.QUEUE_PROVIDER, Queue, false);
  loadProvider(baseDir, config.MAIL_PROVIDER, Mailer, false);
  loadProvider(baseDir, config.SCHEDULER_PROVIDER, Scheduler, false);

  // Core feature services
  loadProvider(baseDir, '../mailer/email-service', undefined, false);
  loadProvider(baseDir, '../cache/cache-service');
  loadProvider(baseDir, '../storage/file-service');
  loadProvider(baseDir, '../security/auth-service');
  loadProvider(baseDir, '../export/export-service');
  loadProvider(baseDir, '../health/health-service');
}
