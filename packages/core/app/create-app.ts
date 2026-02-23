import path from 'node:path';
import { context } from '../context';
import { createServer } from '../server';
import { loadResources } from '../resource';
import { loadDefinitions } from './load-definitions';
import { Application } from './application';

export type CreateAppParams = {
  /** A boolean flag indicating whether the application should automatically
   * start after being created. (default: true) **/
  autoStart?: boolean;
  /** A boolean flag indicating whether the application should automatically load resources
   * configured and exported using factory functions. (default: true) */
  autoLoadResources?: boolean;
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
  // Load all definitions from this project.
  loadDefinitions();

  // Autoload resource models, routes, policies and services.
  if (params.autoLoadResources !== false) {
    await loadResources(
      path.dirname(require.main?.filename || process.argv[1])
    );
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
