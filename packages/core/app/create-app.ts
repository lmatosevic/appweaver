import path from 'node:path';
import { config } from '@appweaver/common';
import { context } from '../context';
import { createServer } from '../server';
import { loadResources, LoadResourcePaths } from '../resource';
import { loadDefinitions } from './load-definitions';
import { loadModules } from './load-modules';
import { Application } from './application';

export type CreateAppParams = {
  /** A relative path where the application will load resources, features, and plugins.
   * This is usually the directory from which the createApp() function is called.
   * (default: ./dist/src) */
  scanPath?: string;
  /** A boolean flag indicating whether the application should automatically
   * start after being created. (default: true) **/
  autoStart?: boolean;
  /** An object containing the path patterns for loading resources from. */
  resourcePaths?: LoadResourcePaths;
  /** A boolean flag indicating whether the application should automatically load
   * resources configured and exported using factory functions. (default: true) */
  autoLoadResources?: boolean;
  /** A boolean flag indicating whether the application should automatically load
   * plugins exported from the configured plugin directory. (default: true) */
  autoLoadPlugins?: boolean;
  /** A boolean flag indicating whether the application should automatically load
   * features exported from the configured plugin directory. (default: true) */
  autoLoadFeatures?: boolean;
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
  let scanPath = path.dirname(require.main?.filename || process.argv[1]);
  if (params.scanPath) {
    scanPath = path.resolve(params.scanPath);
  } else if (config.APP_SCAN_PATH) {
    scanPath = path.resolve(config.APP_SCAN_PATH);
  }

  // Load all definitions from this project
  loadDefinitions(scanPath);

  // Load resource models, routes, policies and services
  if (params.autoLoadResources !== false) {
    await loadResources(scanPath, params.resourcePaths);
  }

  // Load exported plugin files
  if (params.autoLoadPlugins !== false) {
    await loadModules(path.join(scanPath, 'plugins'));
  }

  // Load exported feature files
  if (params.autoLoadFeatures !== false) {
    await loadModules(path.join(scanPath, 'features'));
  }

  // Create a Fastify server instance
  const server = createServer();

  context.server = server;

  const app = new Application(server);

  if (params.autoStart !== false) {
    await app.start();
  }

  return app;
}
