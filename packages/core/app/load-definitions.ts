import path from 'node:path';
import {
  config,
  Database,
  Events,
  logger,
  Mailer,
  Memory,
  Queue,
  Redis,
  Scheduler,
  Storage
} from '@appweaver/common';
import { define } from '../context';
import { requireModule } from '../utils';
import { DefinitionClass } from '../types';

/**
 * Loads and registers the core and infrastructure service definitions.
 * This method initializes and sets up various service components, such as the
 * database, queue system, mailer, storage, and authentication services, among others.
 */
export function loadDefinitions(): void {
  // Common infrastructure services
  loadIfDepsPresent(config.DATABASE_PROVIDER, Database);
  loadIfDepsPresent(config.STORAGE_PROVIDER, Storage);
  loadIfDepsPresent(config.MEMORY_PROVIDER, Memory);
  loadIfDepsPresent(config.EVENTS_PROVIDER, Events);
  loadIfDepsPresent(config.REDIS_PROVIDER, Redis, ['ioredis']);
  loadIfDepsPresent(config.QUEUE_PROVIDER, Queue, ['ioredis', 'bullmq']);
  loadIfDepsPresent(config.MAIL_PROVIDER, Mailer, ['nodemailer']);
  loadIfDepsPresent(config.SCHEDULER_PROVIDER, Scheduler, ['cron']);

  // Core feature services
  loadIfDepsPresent('../mailer/mail-service');
  loadIfDepsPresent('../storage/file-service');
  loadIfDepsPresent('../security/auth-service');
  loadIfDepsPresent('../export/export-service');
  loadIfDepsPresent('../health/health-service');
}

/**
 * Loads a class from the specified class path if all specified dependencies are present.
 * If the class fails to load or any required dependency is missing, the operation is aborted.
 *
 * @param {string} classPath - The path to the module containing the class to be loaded. Can be a relative path or a module identifier.
 * @param {DefinitionClass<any>} [definition] - An optional definition class instance used to define the loaded class.
 * @param {string[]} [dependencies=[]] - An array of dependency module paths or identifiers to check before loading the class.
 * @return This method does not return a value.
 */
function loadIfDepsPresent(
  classPath: string,
  definition?: DefinitionClass<any>,
  dependencies: string[] = []
): void {
  // Import module from the class path
  const { value, error } = requireModule<{ new (...args: any[]): any }>(
    classPath.startsWith('.') ? path.join(__dirname, classPath) : classPath
  );
  if (!value || error) {
    const msg = `Module '${classPath}' does not export required class`;
    logger.error(msg);
    throw new Error(error?.message ?? msg);
  }

  // Extract class constructor from the exported value
  const ctor = Object.values(value)[0];

  // Check if all dependencies are present
  for (const dependency of dependencies) {
    const { error } = requireModule(dependency, false);
    if (error) {
      return;
    }
  }

  define(new ctor(), definition);
}
