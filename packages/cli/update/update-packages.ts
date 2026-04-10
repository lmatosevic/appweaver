import { config, Runtime } from '@appweaver/common';
import { isBunProcess, runProcess } from '../utils';

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

async function updateBunPackages(
  packages: string[],
  quiet: boolean
): Promise<number> {
  // Bun already handles peerDependency version mismatch without error
  return runProcess('bun', ['add', ...packages], { quiet });
}
