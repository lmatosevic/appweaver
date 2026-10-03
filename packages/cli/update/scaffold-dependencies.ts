import fsp from 'node:fs/promises';
import path from 'node:path';
import { compareVersions } from '@appweaver/common';
import { runProcessOutput } from '../utils';
import { isBunRuntime } from './update-packages';

/** The versions of the third-party packages an Appweaver release is built and scaffolded with. */
export type ScaffoldDependencies = {
  /** Packages the framework uses at runtime or requires as a peer dependency. */
  companion: Record<string, string>;
  /** Development tooling a new project is generated with. */
  tooling: Record<string, string>;
};

export type PackageUpdate = {
  name: string;
  from: string;
  to: string;
};

/**
 * Reads the scaffold dependencies of an `@appweaver/cli` release from the package registry.
 *
 * @param {string} version - The version or dist-tag of the release (e.g. `1.7.0`, `latest`).
 * @return {Promise<ScaffoldDependencies | null>} The scaffold dependencies, or `null` when the release has none or
 * the registry could not be reached.
 */
export async function fetchScaffoldDependencies(
  version: string
): Promise<ScaffoldDependencies | null> {
  const args = [`@appweaver/cli@${version}`, 'scaffoldDependencies', '--json'];

  try {
    const { code, stdout } = isBunRuntime()
      ? await runProcessOutput('bun', ['info', ...args])
      : await runProcessOutput('npm', ['view', ...args]);

    if (code !== 0 || !stdout.trim()) {
      return null;
    }

    // npm returns the field of every release matching the version in an array
    const parsed = JSON.parse(stdout);
    const scaffold = Array.isArray(parsed) ? parsed.at(-1) : parsed;

    if (
      typeof scaffold?.companion !== 'object' ||
      typeof scaffold?.tooling !== 'object'
    ) {
      return null;
    }

    return scaffold;
  } catch {
    return null;
  }
}

/**
 * Selects the installed packages whose version is lower than the one in the scaffold dependencies. Packages missing
 * from the project are never added, and the ones not installed from the registry (e.g. `file:`, git, dist-tags) are
 * left as they are.
 *
 * @param {ScaffoldDependencies} scaffold - The scaffold dependencies of the target release.
 * @param {Record<string, string>} installed - The project's dependencies and devDependencies.
 * @param {Object} groups - The scaffold dependency groups to update.
 * @param {boolean} groups.companion - Whether to update the companion packages.
 * @param {boolean} groups.tooling - Whether to update the tooling packages.
 * @return {Promise<PackageUpdate[]>} The packages to update, with their current and new versions.
 */
export async function resolveScaffoldUpdates(
  scaffold: ScaffoldDependencies,
  installed: Record<string, string>,
  groups: { companion: boolean; tooling: boolean }
): Promise<PackageUpdate[]> {
  const versions: Record<string, string> = {
    ...(groups.companion ? scaffold.companion : {}),
    ...(groups.tooling ? scaffold.tooling : {})
  };

  const updates: PackageUpdate[] = [];
  for (const [name, to] of Object.entries(versions)) {
    const declared = installed[name] && cleanVersion(installed[name]);
    const target = cleanVersion(to);
    if (!declared || !target) {
      continue;
    }

    // The lockfile may hold a newer version than the declared range
    const from = (await loadInstalledVersion(name)) ?? declared;
    if (compareVersions(from, target) < 0) {
      updates.push({ name, from, to });
    }
  }

  return updates;
}

/**
 * Reads the version of a package installed in the project's `node_modules`.
 *
 * @param {string} name - The package name.
 * @return {Promise<string | undefined>} The installed version without a prerelease suffix, or `undefined` if the
 * package is not installed.
 */
export async function loadInstalledVersion(
  name: string
): Promise<string | undefined> {
  try {
    const pkgPath = path.join(
      process.cwd(),
      'node_modules',
      name,
      'package.json'
    );
    const { version } = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    return cleanVersion(version);
  } catch {
    return undefined;
  }
}

/** Strips the range operators and the prerelease suffix of a version, or returns `undefined` for other specs. */
function cleanVersion(spec: string): string | undefined {
  return spec.match(/^[\^~=v\s]*(\d+(?:\.\d+)*)/)?.[1];
}
