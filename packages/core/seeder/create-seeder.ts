import path from 'node:path';
import { config, Database } from '@appweaver/common';
import { loadProvider } from '../context';
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
  let seedersPath = path.join(process.cwd(), './dist/database/seeders');
  if (params.seedersPath) {
    seedersPath = path.resolve(params.seedersPath);
  } else if (config.APP_SCAN_PATH) {
    seedersPath = path.resolve(config.DATABASE_SEEDERS_DIR_PATH);
  }

  let scanPath = path.join(process.cwd(), './dist/src');
  if (params.scanPath) {
    scanPath = path.resolve(params.scanPath);
  } else if (config.APP_SCAN_PATH) {
    scanPath = path.resolve(config.APP_SCAN_PATH);
  }

  loadProvider(scanPath, config.DATABASE_PROVIDER, Database);

  const seeder = new Seeder(seedersPath, params.continueOnError);

  if (params.autoSeed !== false) {
    await seeder.seed();
  }

  return seeder;
}
