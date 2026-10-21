import fs from 'node:fs';
import path from 'node:path';
import {
  appConfig,
  ErrorCode,
  findFilesByPattern,
  importModule,
  isModule,
  Module,
  ModuleError,
  requireModule,
  satisfiesVersion
} from '@appweaver/common';
import { context } from '../context/context';
import { firstPartyModules } from '../modules';

/** Where an enabled module was found. */
export type ModuleSource = 'core' | 'package' | 'local' | 'explicit';

/** A module enabled in the application. */
export type EnabledModule = {
  module: Module;
  source: ModuleSource;
  /** The path of its manifest, except for the modules of core. */
  path?: string;
};

export type DiscoverModulesParams = {
  /** The directory the local module pattern resolves against, i.e. `./dist/src`. */
  scanPath: string;
  /** The project root holding the `package.json` file. Default: the current working directory. */
  rootPath?: string;
  /**
   * Whether the local and explicit manifests are the TypeScript sources, required as they are, i.e. by `weaver
   * generate` with a registered TypeScript loader. Default: `false`, the manifests of the current runtime.
   */
  sources?: boolean;
};

/** The packages a project never enables as modules, the framework itself. */
const frameworkPackages = ['@appweaver/common', '@appweaver/core'];

/**
 * Finds the modules of the application: the module of core, the dependencies whose `package.json` has the
 * `appweaver.module` field (with the modules they require), the local manifests matching `app.modulesPattern`, and the
 * manifests listed in `app.modules`. The modules of `app.modulesDisabled` are left out.
 *
 * @param {DiscoverModulesParams} params - The paths to discover the modules in.
 * @return {Promise<EnabledModule[]>} The enabled modules, every one after the modules it requires.
 * @throws {ModuleError} For an invalid manifest, a duplicate name, a missing required module, or a module supporting
 * another framework version.
 */
export async function discoverModules(
  params: DiscoverModulesParams
): Promise<EnabledModule[]> {
  const rootPath = params.rootPath ?? process.cwd();
  const found: EnabledModule[] = [];

  for (const { module } of firstPartyModules) {
    found.push({ module, source: 'core' });
  }

  found.push(...(await findPackageModules(rootPath)));

  const sources = params.sources ?? false;

  if (appConfig.MODULES_PATTERN) {
    const paths = await findFilesByPattern(
      appConfig.MODULES_PATTERN,
      params.scanPath,
      true,
      !sources
    );
    for (const manifestPath of paths) {
      found.push(await importManifest(manifestPath, 'local', sources));
    }
  }

  for (const modulePath of appConfig.MODULES) {
    const manifestPath = path.resolve(rootPath, modulePath);
    found.push(await importManifest(manifestPath, 'explicit', sources));
  }

  checkDuplicates(found);

  const disabled = new Set(appConfig.MODULES_DISABLED);
  const enabled = found.filter(({ module }) => !disabled.has(module.name));

  checkFramework(enabled);

  return orderByRequires(enabled);
}

/** Finds the modules among the dependencies of the project, and the modules they require. */
async function findPackageModules(rootPath: string): Promise<EnabledModule[]> {
  const packageJson = readJson(path.join(rootPath, 'package.json'));
  if (!packageJson) {
    return [];
  }

  const modules: EnabledModule[] = [];
  const visited = new Set<string>(frameworkPackages);
  const pending: [name: string, fromPath: string][] = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies
  }).map((name) => [name, rootPath]);

  while (pending.length > 0) {
    const [name, fromPath] = pending.shift()!;
    if (visited.has(name)) {
      continue;
    }
    visited.add(name);

    const packagePath = findPackagePath(name, fromPath);
    const manifestField = packagePath
      ? readJson(path.join(packagePath, 'package.json'))?.appweaver?.module
      : undefined;
    if (!packagePath || typeof manifestField !== 'string') {
      continue;
    }

    const enabled = await importManifest(
      path.resolve(packagePath, manifestField),
      'package'
    );
    modules.push(enabled);

    for (const required of enabled.module.requires ?? []) {
      pending.push([required, packagePath]);
    }
  }

  return modules;
}

/**
 * Loads a part of every module declaring it, in the order of the modules.
 *
 * @param {EnabledModule[]} modules - The enabled modules.
 * @param {'resources' | 'main' | 'web'} part - The part to load.
 * @return {Promise<unknown[]>} The exports of the part of every module.
 */
export async function loadModuleParts(
  modules: EnabledModule[],
  part: 'resources' | 'main' | 'web'
): Promise<unknown[]> {
  const exports: unknown[] = [];
  for (const { module } of modules) {
    const load = module[part];
    if (load) {
      exports.push(await load());
    }
  }
  return exports;
}

/**
 * Returns the directories the enabled modules declare for a part, in the load order of the modules, i.e. the
 * translations directories the `LocaleService` reads before the one of the application.
 *
 * @param {'locales' | 'templates' | 'seeders'} part - The part of the manifests.
 * @return {string[]} The absolute paths of the directories.
 */
export function moduleDirectories(
  part: 'locales' | 'templates' | 'seeders'
): string[] {
  return context.modules.enabled.flatMap((module) => module[part] ?? []);
}

/**
 * Parses the config sections the enabled modules declare in their `config`, so an invalid value fails the start of
 * the application instead of the first read of its key. The sections of a driver module are parsed only when one of
 * its providers is selected.
 *
 * @throws {ConfigurationError} For the first section with an invalid or missing value.
 */
export function checkModuleConfig(): void {
  for (const module of context.modules.enabled) {
    const used =
      !module.providers?.length ||
      module.providers.some(
        ({ contract, name }) =>
          context.modules.providers.get(contract.name) === name
      );
    if (!used) {
      continue;
    }
    for (const section of module.config ?? []) {
      // Reading the values parses the section
      Object.values(section);
    }
  }
}

/**
 * Checks if a module is enabled.
 *
 * @param {EnabledModule[]} modules - The enabled modules.
 * @param {string} name - The name of the module.
 * @return {boolean} `true` if the module is among the enabled ones.
 */
export function isModuleEnabled(
  modules: EnabledModule[],
  name: string
): boolean {
  return modules.some(({ module }) => module.name === name);
}

/** Imports a manifest, which must be the default export of its file. */
async function importManifest(
  manifestPath: string,
  source: ModuleSource,
  sources: boolean = false
): Promise<EnabledModule> {
  const { value, error } = sources
    ? requireModule(manifestPath)
    : await importModule(manifestPath);
  const manifest = (value as { default?: unknown } | null)?.default ?? value;
  if (error || !isModule(manifest)) {
    throw new ModuleError(
      ErrorCode.ModuleInvalid,
      error
        ? `Loading the module '${manifestPath}' failed`
        : `The module '${manifestPath}' does not export a manifest of defineModule()`,
      { path: manifestPath },
      { cause: error ?? undefined }
    );
  }
  return { module: manifest, source, path: manifestPath };
}

/** Rejects two modules with the same name. */
function checkDuplicates(modules: EnabledModule[]): void {
  const paths = new Map<string, string[]>();
  for (const { module, path: manifestPath, source } of modules) {
    paths.set(module.name, [
      ...(paths.get(module.name) ?? []),
      manifestPath ?? source
    ]);
  }

  for (const [name, namePaths] of paths) {
    if (namePaths.length > 1) {
      throw new ModuleError(
        ErrorCode.ModuleDuplicate,
        `The module '${name}' is enabled more than once: ${namePaths.join(', ')}`,
        { name, paths: namePaths }
      );
    }
  }
}

/** Rejects a module whose framework range excludes the version of core. */
function checkFramework(modules: EnabledModule[]): void {
  const version = frameworkVersion();
  for (const { module } of modules) {
    if (module.framework && !satisfiesVersion(version, module.framework)) {
      throw new ModuleError(
        ErrorCode.ModuleIncompatible,
        `The module '${module.name}' supports Appweaver ${module.framework}, not ${version}`,
        { name: module.name, framework: module.framework, version }
      );
    }
  }
}

/**
 * Orders the modules so every module comes after the modules it requires, keeping the order they were found in
 * otherwise.
 */
function orderByRequires(modules: EnabledModule[]): EnabledModule[] {
  const byName = new Map(modules.map((entry) => [entry.module.name, entry]));
  const ordered: EnabledModule[] = [];
  const visited = new Set<string>();

  const visit = (entry: EnabledModule) => {
    if (visited.has(entry.module.name)) {
      return;
    }
    visited.add(entry.module.name);

    for (const required of entry.module.requires ?? []) {
      const requiredEntry = byName.get(required);
      if (!requiredEntry) {
        throw new ModuleError(
          ErrorCode.ModuleMissing,
          `The module '${entry.module.name}' requires the module '${required}', which is not enabled`,
          { name: required, requiredBy: entry.module.name }
        );
      }
      visit(requiredEntry);
    }

    ordered.push(entry);
  };

  modules.forEach(visit);

  return ordered;
}

/** The version of core, which the framework range of a module is checked against. */
function frameworkVersion(): string {
  return readJson(path.join(__dirname, '../package.json'))?.version ?? '0.0.0';
}

/** Finds the directory of an installed package, looking up the `node_modules` directories from a path. */
function findPackagePath(name: string, fromPath: string): string | undefined {
  let directory = path.resolve(fromPath);
  for (;;) {
    const candidate = path.join(directory, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

function readJson(filePath: string): Record<string, any> | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}
