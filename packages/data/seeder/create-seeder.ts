import { resolveSourcePath, appConfig } from '@appweaver/common';
import { databaseConfig } from '../database/database-config';
import { discoverModules } from '@appweaver/core';
import { loadProviders } from '@appweaver/core/internal';
import { Seeder } from './seeder';

export type CreateSeederParams = {
  /** A relative path where the application source code is located.
   * This is usually the directory from which the createApp() function is called.
   * (default: ./dist/src) */
  scanPath?: string;
  /** A relative path where the seeder functions are located.
   * (default: ./dist/database/seeders) */
  seedersPath?: string;
  /** A flag indication if the seeder should continue execution even if an error occurs.
   * (default: false) */
  continueOnError?: boolean;
  /** A boolean flag indicating whether the seeder should automatically
   * start seeding after being created. (default: true) **/
  autoSeed?: boolean;
  /** A boolean flag indicating whether to automatically fix all warnings
   * related to the seeders like wrong checksum or deleted seeder files.
   * (default: false) **/
  fixWarnings?: boolean;
};

/**
 * Creates the database seeder, loading the providers of the project first, and runs the pending seeders unless
 * `autoSeed` is disabled: the seeders of the modules declaring a `seeders` directory first, then the ones of the
 * application.
 *
 * @param {CreateSeederParams} [params={}] - The seeder parameters.
 * @return {Promise<Seeder>} The created seeder.
 */
export async function createSeeder(
  params: CreateSeederParams = {}
): Promise<Seeder> {
  const scanPath = resolveSourcePath(
    appConfig.BUILD_PATH,
    appConfig.SOURCE_PATH,
    params.scanPath,
    './dist/src'
  );
  const seedersPath = resolveSourcePath(
    appConfig.BUILD_PATH,
    databaseConfig.SEEDERS_DIR_PATH,
    params.seedersPath,
    './dist/database/seeders'
  );

  // Define the providers and the services of the modules
  const modules = await discoverModules({ scanPath });
  await loadProviders(modules, scanPath);

  const seeder = new Seeder(
    seedersPath,
    params.continueOnError,
    params.fixWarnings,
    modules.flatMap(({ module }) =>
      module.seeders ? [{ name: module.name, path: module.seeders }] : []
    )
  );

  if (params.autoSeed !== false) {
    await seeder.seed();
  }

  return seeder;
}
