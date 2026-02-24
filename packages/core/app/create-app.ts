import path from 'node:path';
import { context } from '../context';
import { createServer } from '../server';
import { loadResources } from '../resource';
import { loadDefinitions } from './load-definitions';
import { loadModules } from './load-modules';
import { Application } from './application';

export type CreateAppParams = {
  /** A boolean flag indicating whether the application should automatically
   * start after being created. (default: true) **/
  autoStart?: boolean;
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
 * @param {boolean} [params.autoLoadResources=true] Whether to automatically load resource models, routes, policies, and services.
 * @param {boolean} [params.autoStart=true] Whether to automatically start the application server after creation.
 * @return {Promise<Application>} A promise that resolves to the initialized application instance.
 */
export async function createApp(
  params: CreateAppParams = {}
): Promise<Application> {
  const rootPath = path.dirname(require.main?.filename || process.argv[1]);

  // Load all definitions from this project.
  loadDefinitions();

  // Load resource models, routes, policies and services.
  if (params.autoLoadResources !== false) {
    await loadResources(rootPath);
  }

  // Load exported plugin files.
  if (params.autoLoadPlugins !== false) {
    await loadModules(path.join(rootPath, 'plugins'));
  }

  // Load exported feature files.
  if (params.autoLoadFeatures !== false) {
    await loadModules(path.join(rootPath, 'features'));
  }

  // Create a Fastify server instance.
  const server = createServer();

  context.server = server;

  const app = new Application(server);

  if (params.autoStart !== false) {
    await app.start();
  }

  return app;
}
