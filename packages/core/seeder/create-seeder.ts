import path from 'node:path';
import { config } from '@appweaver/common';
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
};

export async function createSeeder(
  params: CreateSeederParams = {}
): Promise<Seeder> {
  // Determine the base directory to scan for application resources
  let scanPath = path.join(process.cwd(), './dist/src');
  if (params.scanPath) {
    scanPath = path.resolve(params.scanPath);
  } else if (config.APP_BUILD_PATH && config.APP_SCAN_PATH) {
    scanPath = path.resolve(
      path.join(config.APP_BUILD_PATH, config.APP_SCAN_PATH)
    );
  }

  // Determine the base directory to scan for seeder files
  let seedersPath = path.join(process.cwd(), './dist/database/seeders');
  if (params.seedersPath) {
    seedersPath = path.resolve(params.seedersPath);
  } else if (config.APP_BUILD_PATH && config.DATABASE_SEEDERS_DIR_PATH) {
    seedersPath = path.resolve(
      path.join(config.APP_BUILD_PATH, config.DATABASE_SEEDERS_DIR_PATH)
    );
  }

  // Load all defined providers from this project
  loadProviders(scanPath);

  const seeder = new Seeder(seedersPath, params.continueOnError);

  if (params.autoSeed !== false) {
    await seeder.seed();
  }

  return seeder;
}
