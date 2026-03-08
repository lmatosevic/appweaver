import path from 'node:path';
import {
  Cache,
  config,
  Ctor,
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
 * database, cache, queue system, mailer, storage, and authentication services, among others.
 *
 * @param {string} baseDir - The base directory containing the module files.
 */
export function loadDefinitions(baseDir: string): void {
  // Common infrastructure services
  loadModule(baseDir, config.DATABASE_PROVIDER, Database);
  loadModule(baseDir, config.STORAGE_PROVIDER, Storage);
  loadModule(baseDir, config.MEMORY_PROVIDER, Memory);
  loadModule(baseDir, config.CACHE_PROVIDER, Cache);
  loadModule(baseDir, config.EVENTS_PROVIDER, Events);
  loadModule(baseDir, config.REDIS_PROVIDER, Redis, false);
  loadModule(baseDir, config.QUEUE_PROVIDER, Queue, false);
  loadModule(baseDir, config.MAIL_PROVIDER, Mailer, false);
  loadModule(baseDir, config.SCHEDULER_PROVIDER, Scheduler, false);

  // Core feature services
  loadModule(baseDir, '../mailer/email-service', undefined, false);
  loadModule(baseDir, '../cache/cache-service');
  loadModule(baseDir, '../storage/file-service');
  loadModule(baseDir, '../security/auth-service');
  loadModule(baseDir, '../export/export-service');
  loadModule(baseDir, '../health/health-service');
}

/**
 * Loads a module from the specified class path, resolves its constructor, and defines it with the provided definition.
 *
 * @param {string} baseDir - The base directory used to resolve relative class paths.
 * @param {string} classPath - The path to the module to be loaded. Can be an absolute path, project source path, or
 *                             node_modules package.
 * @param {DefinitionClass} [definition] - An optional definition object used to define the loaded module.
 * @param {boolean} [required=true] - Indicates whether the module is required. If true, an error is thrown on failure;
 *                                    otherwise, a warning is logged.
 * @return This function does not return a value. It loads a module and defines it if successful.
 */
function loadModule(
  baseDir: string,
  classPath: string,
  definition?: DefinitionClass,
  required: boolean = true
): void {
  let modulePath: string;
  if (classPath.startsWith('@/')) {
    // Load module from the calling project source directory
    modulePath = path.join(baseDir, classPath.replace('@/', ''));
  } else if (classPath.startsWith('.')) {
    // Load from the core project directory
    modulePath = path.join(__dirname, classPath);
  } else {
    // Load from the node_modules directory
    modulePath = classPath;
  }

  // Try to import module from the class path
  const { value, error } = requireModule<Record<string, Ctor>>(
    modulePath,
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

  define(ctor, definition);
}
