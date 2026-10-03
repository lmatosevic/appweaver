import { config, Runtime } from '@appweaver/common';
import { isBunProcess, runProcess } from '../utils';

/**
 * Installs the packages with the specified versions.
 *
 * @param {Record<string, string>} packages - The versions to install, keyed by package name.
 * @param {boolean} [force=false] - Whether to forcibly update the packages, overriding any potential constraints.
 * @param {boolean} [quiet=true] - Whether to suppress output logs during the update process.
 * @return {Promise<number>} A promise that resolves with the exit code of the package manager.
 */
export async function updatePackages(
  packages: Record<string, string>,
  force: boolean = false,
  quiet: boolean = true
): Promise<number> {
  const packagesWithVersion = Object.entries(packages).map(
    ([name, version]) => `${name}@${version}`
  );

  if (isBunRuntime()) {
    return updateBunPackages(packagesWithVersion, quiet);
  } else {
    return updateNodePackages(packagesWithVersion, force, quiet);
  }
}

/**
 * Whether the project's packages are managed with Bun instead of npm.
 *
 * @return {boolean} `true` when running in Bun with the Bun application runtime configured.
 */
export function isBunRuntime(): boolean {
  return isBunProcess() && config.APP_RUNTIME === Runtime.Bun;
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
  // npm keeps an installed package in the dependencies section it is already in
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
