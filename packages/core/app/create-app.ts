import {
  configFiles,
  logger,
  resolveSourcePath,
  appConfig
} from '@appweaver/common';
import { LoadResourcePaths, loadResources } from '../resource';
import {
  discoverModules,
  isModuleEnabled,
  loadModuleParts
} from './discover-modules';
import { loadProviders } from './load-providers';
import { loadAppFiles } from './load-app-files';
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
  /** Path pattern used for finding the files that export application logic
   * (default: `./src/"*"/index.ts`) */
  appFilesPattern?: string;
  /** A boolean flag indicating whether the application should automatically load
   * resources configured and exported using factory functions. (default: true) */
  autoLoadResources?: boolean;
  /** A boolean flag indicating whether the application should automatically load
   * the files of `app.scanFilesPattern` from the project source directory. (default: true) */
  autoLoadAppFiles?: boolean;
};

/**
 * Creates and initializes an application instance with the provided parameters. The modules of the application are
 * loaded in order: the providers and services of every module, the resources of the modules and the application
 * (with a database), the `main` part of every module, the files of the application, and the `web` part of every module
 * (with a server).
 *
 * @param {CreateAppParams} [params={}] Configuration parameters for creating the application.
 * @return {Promise<Application>} A promise that resolves to the initialized application instance.
 */
export async function createApp(
  params: CreateAppParams = {}
): Promise<Application> {
  logger.debug({ configFiles }, 'Configuration loaded');

  const scanPath = resolveSourcePath(
    appConfig.BUILD_PATH,
    appConfig.SOURCE_PATH,
    params.scanPath,
    './dist/src'
  );

  const modules = await discoverModules({ scanPath });

  // Define the providers and the services of the modules
  await loadProviders(modules, scanPath);

  // Load resource models, routes, policies and services
  if (
    params.autoLoadResources !== false &&
    isModuleEnabled(modules, '@appweaver/data')
  ) {
    await loadResources(
      scanPath,
      params.resourcePaths,
      modules.flatMap(({ module }) => module.resources ?? [])
    );
  }

  await loadModuleParts(modules, 'main');

  // Load exported application files
  if (params.autoLoadAppFiles !== false) {
    await loadAppFiles(scanPath, params.appFilesPattern);
  }

  if (isModuleEnabled(modules, '@appweaver/web')) {
    await loadModuleParts(modules, 'web');
  }

  const app = new Application();

  if (params.autoStart !== false) {
    await app.start(params.autoStartServer);
  }

  return app;
}
