import {
  config,
  configFiles,
  logger,
  resolveSourcePath
} from '@appweaver/common';
import { context } from '../context';
import { createServer } from '../server';
import { LoadResourcePaths, loadResources } from '../resource';
import { loadProviders } from './load-providers';
import { loadModules } from './load-modules';
import { Application } from './application';

export type CreateAppParams = {
  /** A relative path where the application will load resources and other features.
   * This is usually the directory from which the createApp() function is called.
   * (default: ./dist/src) */
  scanPath?: string;
  /** A boolean flag indicating whether the application should automatically
   * start after being created. (default: true) **/
  autoStart?: boolean;
  /** A boolean flag indicating whether the web server should automatically
   * start after being created. (default: true) **/
  autoStartServer?: boolean;
  /** An object containing the path patterns for loading resources from. */
  resourcePaths?: LoadResourcePaths;
  /** Path pattern used for finding modules that export application logic
   * (default: `./src/"*"/index.ts`) */
  modulePaths?: string;
  /** A boolean flag indicating whether the application should automatically load
   * resources configured and exported using factory functions. (default: true) */
  autoLoadResources?: boolean;
  /** A boolean flag indicating whether the application should automatically load
   * export modules from the project source directory. (default: true) */
  autoLoadModules?: boolean;
};

/**
 * Creates and initializes an application instance with the provided parameters.
 *
 * @param {CreateAppParams} [params={}] Configuration parameters for creating the application.
 * @return {Promise<Application>} A promise that resolves to the initialized application instance.
 */
export async function createApp(
  params: CreateAppParams = {}
): Promise<Application> {
  logger.debug({ configFiles }, 'Configuration loaded');

  const scanPath = resolveSourcePath(
    config.APP_BUILD_PATH,
    config.APP_SOURCE_PATH,
    params.scanPath,
    './dist/src'
  );

  // Load all defined providers from this project
  loadProviders(scanPath);

  // Load resource models, routes, policies and services
  if (params.autoLoadResources !== false) {
    await loadResources(scanPath, params.resourcePaths);
  }

  // Load exported application files
  if (params.autoLoadModules !== false) {
    await loadModules(scanPath, params.modulePaths);
  }

  // Create a Fastify server instance
  const server = createServer();

  context.server = server;

  const app = new Application(server);

  if (params.autoStart !== false) {
    await app.start(params.autoStartServer);
  }

  return app;
}
