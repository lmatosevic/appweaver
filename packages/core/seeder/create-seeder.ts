import { loadProviders } from '../app/load-providers';
import { resolveScanPath, resolveSeedersPath } from '../utils';
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
  const scanPath = resolveScanPath(params.scanPath);
  const seedersPath = resolveSeedersPath(params.seedersPath);

  // Load all defined providers from this project
  loadProviders(scanPath);

  const seeder = new Seeder(seedersPath, params.continueOnError);

  if (params.autoSeed !== false) {
    await seeder.seed();
  }

  return seeder;
}
