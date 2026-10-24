import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isModule, Module } from '@appweaver/common';

/**
 * Checks if a name of `weaver module add` is a package rather than a scaffold module: one that is not a scaffold
 * module, with a scope, a slash or a dash. Any other name is a scaffold module, so a mistyped one is reported as
 * unknown instead of installed from the registry.
 *
 * @param {string} name - The name, i.e. `redis` or `@acme/appweaver-gcs`.
 * @param {readonly string[]} scaffoldModules - The names of the scaffold modules.
 * @return {boolean} `true` for a package name.
 */
export function isPackageName(
  name: string,
  scaffoldModules: readonly string[]
): boolean {
  return (
    !scaffoldModules.includes(name) &&
    (name.startsWith('@') || name.includes('/') || name.includes('-'))
  );
}

/**
 * Describes the module of an installed package: its name, providers and config sections, or why it is not a module.
 *
 * @param {string} rootPath - The project root the package is installed in.
 * @param {string} packageName - The package name, i.e. `@acme/appweaver-gcs`.
 * @return {string[]} The lines describing the module.
 */
export function describePackageModule(
  rootPath: string,
  packageName: string
): string[] {
  const projectRequire = createRequire(path.join(rootPath, 'package.json'));
  let packageJsonPath: string;
  try {
    packageJsonPath = projectRequire.resolve(`${packageName}/package.json`);
  } catch {
    return [`Package ${packageName} is not installed.`];
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const manifestPath = packageJson.appweaver?.module;
  if (typeof manifestPath !== 'string') {
    return [
      `Package ${packageName} is not an Appweaver module, its package.json has no appweaver.module field.`
    ];
  }

  let module: Module | undefined;
  try {
    const exported = projectRequire(
      path.resolve(path.dirname(packageJsonPath), manifestPath)
    );
    const manifest = exported?.default ?? exported;
    module = isModule(manifest) ? manifest : undefined;
  } catch {
    module = undefined;
  }
  if (!module) {
    return [`Package ${packageName} does not export a valid module manifest.`];
  }

  const lines = [`Module ${module.name} is enabled.`];
  for (const provider of module.providers ?? []) {
    lines.push(
      `  provides ${provider.contract.name} "${provider.name}", select it in the provider key of the contract`
    );
  }
  for (const required of module.requires ?? []) {
    lines.push(`  requires ${required}`);
  }
  return lines;
}
