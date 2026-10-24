import fs from 'node:fs';
import path from 'node:path';
import { ScaffoldError } from './types';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

/** The version of the Appweaver packages a project is scaffolded with, the version of this package. */
export const frameworkVersion: string = pkg.version;

/**
 * The versions of the npm packages a project is scaffolded with, read from the `scaffoldDependencies` the build
 * injects into the published package.json from the root one. Running from the sources (as the tests do), they are
 * read from the root directly. The Appweaver packages are left out, since they follow {@link frameworkVersion}.
 */
const packageVersions: Record<string, string> = (() => {
  const scaffold =
    pkg.scaffoldDependencies ??
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'package.json'),
        'utf8'
      )
    ).scaffoldDependencies;
  return { ...scaffold.companion, ...scaffold.tooling };
})();

/**
 * Returns the version a package is scaffolded with.
 *
 * @param {string} name - The package name.
 * @return {string} The exact version of the package.
 * @throws {ScaffoldError} When the package has no scaffold dependency version.
 */
export function packageVersion(name: string): string {
  const version = packageVersions[name];
  if (!version) {
    throw new ScaffoldError(`Missing scaffold dependency version of ${name}`);
  }
  return version;
}
