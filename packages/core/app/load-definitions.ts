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
import { Ctor, DefinitionClass } from '../types';

/**
 * Loads and registers the core and infrastructure service definitions.
 * This method initializes and sets up various service components, such as the
 * database, queue system, mailer, storage, and authentication services, among others.
 */
export function loadDefinitions(): void {
  // Common infrastructure services
  loadModule(config.DATABASE_PROVIDER, Database);
  loadModule(config.STORAGE_PROVIDER, Storage);
  loadModule(config.MEMORY_PROVIDER, Memory);
  loadModule(config.EVENTS_PROVIDER, Events);
  loadModule(config.REDIS_PROVIDER, Redis, false);
  loadModule(config.QUEUE_PROVIDER, Queue, false);
  loadModule(config.MAIL_PROVIDER, Mailer, false);
  loadModule(config.SCHEDULER_PROVIDER, Scheduler, false);

  // Core feature services
  loadModule('../mailer/mail-service', undefined, false);
  loadModule('../storage/file-service');
  loadModule('../security/auth-service');
  loadModule('../export/export-service');
  loadModule('../health/health-service');
}

/**
 * Loads a class from the specified class path if all specified dependencies are present.
 * If the class fails to load or any required dependency is missing, the operation is aborted.
 *
 * @param {string} classPath - The path to the module containing the class to be loaded. Can be a relative path or a module identifier.
 * @param {DefinitionClass<any>} [definition] - An optional definition class instance used to define the loaded class.
 * @param {boolean} [required=true] - A flag indication if the module is required and should fail if not found.
 * @return This method does not return a value.
 */
function loadModule(
  classPath: string,
  definition?: DefinitionClass,
  required: boolean = true
): void {
  // Try to import module from the class path
  const { value, error } = requireModule<Record<string, Ctor>>(
    classPath.startsWith('.') ? path.join(__dirname, classPath) : classPath,
    false
  );

  // Handle errors or missing values for both required and optional modules
  if (!value || error) {
    const msg = `Loading '${classPath}' module failed: ${error}`;
    if (required) {
      logger.error(msg);
      throw error ?? new Error(msg);
    }
    logger.warn(msg);
    return;
  }

  // Extract class constructor from the exported value
  const ctor = Object.values(value)[0];

  define(new ctor(), definition);
}
