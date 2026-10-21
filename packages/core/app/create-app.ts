import {
  configFiles,
  logger,
  resolveSourcePath,
  appConfig
} from '@appweaver/common';
import { discoverModules, loadModuleParts } from './discover-modules';
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
  /** The path patterns of the resource files, read by `@appweaver/data` (`modelPattern`, `servicePattern`,
   * `policyPattern`) and `@appweaver/web` (`routePattern`). */
  resourcePaths?: Record<string, string>;
  /** Path pattern used for finding the files that export application logic
   * (default: `./src/"*"/index.ts`) */
  appFilesPattern?: string;
  /** A boolean flag indicating whether `@appweaver/data` and `@appweaver/web` should automatically load the
   * resources of the application. (default: true) */
  autoLoadResources?: boolean;
  /** A boolean flag indicating whether the application should automatically load
   * the files of `app.scanFilesPattern` from the project source directory. (default: true) */
  autoLoadAppFiles?: boolean;
};

/**
 * Creates and initializes an application instance with the provided parameters. The modules of the application are
 * loaded in order: the providers and services of every module, the `setup` of every module (`@appweaver/data` loads
 * the resources, `@appweaver/web` the routes and the `web` parts), the `main` part of every module, then the files of
 * the application.
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

  // Let every module load what it brings, i.e. the resources with a database
  const manifests = modules.map(({ module }) => module);
  for (const module of manifests) {
    await module.setup?.({ modules: manifests, scanPath, params });
  }

  await loadModuleParts(modules, 'main');

  // Load exported application files
  if (params.autoLoadAppFiles !== false) {
    await loadAppFiles(scanPath, params.appFilesPattern);
  }

  const app = new Application();

  if (params.autoStart !== false) {
    await app.start();
  }

  return app;
}
