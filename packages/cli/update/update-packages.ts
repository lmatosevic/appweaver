import { config, Runtime } from '@appweaver/common';
import { isBunProcess, runProcess } from '../utils';

/**
 * Updates a list of packages to the specified version.
 *
 * @param {string[]} packages - An array of package names to be updated.
 * @param {string} version - The version to which the packages should be updated.
 * @param {boolean} [force=false] - Whether to forcibly update the packages, overriding any potential constraints.
 * @param {boolean} [quiet=true] - Whether to suppress output logs during the update process.
 * @return {Promise<number>} Resolves to the number of packages successfully updated.
 */
export async function updatePackages(
  packages: string[],
  version: string,
  force: boolean = false,
  quiet: boolean = true
): Promise<number> {
  const packagesWithVersion = packages.map((p) => `${p}@${version}`);

  if (isBunProcess() && config.APP_RUNTIME === Runtime.Bun) {
    return updateBunPackages(packagesWithVersion, quiet);
  } else {
    return updateNodePackages(packagesWithVersion, force, quiet);
  }
}

/**
 * Updates the specified Node.js packages using npm.
 *
 * @param {string[]} packages - An array of package names to update.
 * @param {boolean} force - A flag indicating whether to force the update by ignoring peer dependencies.
 * @param {boolean} quiet - A flag indicating whether to suppress output during the update process.
 * @return {Promise<number>} A promise that resolves with the exit code of the npm process.
 */
async function updateNodePackages(
  packages: string[],
  force: boolean,
  quiet: boolean
): Promise<number> {
  return runProcess(
    'npm',
    ['install', ...packages, ...(force ? ['--legacy-peer-deps'] : [])],
    { quiet }
  );
}

/**
 * Updates the specified Bun packages by adding them to the project.
 *
 * @param {string[]} packages - An array of package names to update or add.
 * @param {boolean} quiet - A flag to suppress output if set to true.
 * @return {Promise<number>} A promise that resolves to the exit code of the process.
 */
async function updateBunPackages(
  packages: string[],
  quiet: boolean
): Promise<number> {
  // Bun already handles peerDependency version mismatch without error
  return runProcess('bun', ['add', ...packages], { quiet });
}
