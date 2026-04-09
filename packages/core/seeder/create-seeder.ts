import { config, resolveSourcePath } from '@appweaver/common';
import { loadProviders } from '../app/load-providers';
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

export async function createSeeder(
  params: CreateSeederParams = {}
): Promise<Seeder> {
  const scanPath = resolveSourcePath(
    config.APP_BUILD_PATH,
    config.APP_SOURCE_PATH,
    params.scanPath,
    './dist/src'
  );
  const seedersPath = resolveSourcePath(
    config.APP_BUILD_PATH,
    config.DATABASE_SEEDERS_DIR_PATH,
    params.seedersPath,
    './dist/database/seeders'
  );

  // Load all defined providers from this project
  loadProviders(scanPath);

  const seeder = new Seeder(
    seedersPath,
    params.continueOnError,
    params.fixWarnings
  );

  if (params.autoSeed !== false) {
    await seeder.seed();
  }

  return seeder;
}
