import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { glob } from 'glob';
import { register } from 'ts-node';
import {
  isResourceModel,
  relinkResourceModels,
  ResourceModel,
  appConfig
} from '@appweaver/common';
import {
  discoverModules,
  EnabledModule,
  isModuleEnabled
} from '@appweaver/core';

/**
 * Loads and parses the `package.json` file located in the CLI project package directory.
 * The function attempts to locate the `package.json` file in one of two
 * predefined directories relative to the current module's directory.
 * If the file is found, its contents are read and parsed into a JavaScript object.
 *
 * @return {Record<string, Object>} The parsed contents of the `package.json` file as a key-value object.
 */
export function loadCliPackageJson(): Record<string, any> {
  const pkgPath = path.join(__dirname, '../package.json');
  const pkgContent = fs.readFileSync(pkgPath, 'utf8');
  return JSON.parse(pkgContent);
}

/**
 * Loads the `package.json` file from the local working directory and parses its content into a JavaScript object.
 *
 * @return {Promise<Record<string, Object>>} A promise that resolves to an object representing the contents of the
 * `package.json` file, where keys and values are strings.
 */
export async function loadLocalPackageJson(): Promise<Record<string, any>> {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkgContent = await fsp.readFile(pkgPath, 'utf-8');
  return JSON.parse(pkgContent);
}

/**
 * Checks if the working directory is a module package, whose `package.json` has the `appweaver.module` field.
 *
 * @return {Promise<boolean>} `true` for a module package.
 */
export async function isModulePackage(): Promise<boolean> {
  try {
    return typeof (await loadLocalPackageJson()).appweaver?.module === 'string';
  } catch {
    return false;
  }
}

/**
 * Loads and registers resource models from the enabled modules and the specified file pattern.
 *
 * This method discovers the modules of the project from its sources, takes the models of their resources, then scans
 * for model files that match the given pattern, imports them, and checks if they conform to the resource model schema.
 * Valid models are added to the returned collection, a model of the project replacing a model of a module.
 *
 * @param {string} [modelPattern] - The glob pattern used to locate model files. The default value is used from config.
 * @param {boolean} [prune=true] - Whether to leave out the framework models the project does not use (the auth data
 * model without an auth model, File without file fields, Seeder without a seeders directory of the project or a module).
 * @param {Set<string>} [registeredByModules] - Collects the names of the models whose module package registers them in
 * the resource registry itself, which the project must not register again.
 * @return {Promise<Record<string, ResourceModel>>} A promise resolving to an object containing the loaded resource models,
 * where the keys are the model names and the values are the associated ResourceModel objects.
 */
export async function loadModels(
  modelPattern: string,
  prune: boolean = true,
  registeredByModules?: Set<string>
): Promise<Record<string, ResourceModel>> {
  const cwd = process.cwd();

  register({
    transpileOnly: true,
    compilerOptions: {
      module: 'CommonJS'
    }
  });

  const models: Record<string, ResourceModel> = {};

  // The modules are found in the sources, which the registered loader compiles
  const modules = await discoverModules({
    scanPath: path.resolve(appConfig.SOURCE_PATH),
    sources: true
  });
  const modelExports: any[] = [];

  // Add project files using a pattern
  const modelPaths = await glob(modelPattern, { cwd, absolute: true });

  // Sort is needed since glob returns files in non-deterministic order
  modelPaths.sort();

  for (const modelPath of modelPaths) {
    try {
      // Clear cache to ensure fresh model data
      delete require.cache[require.resolve(modelPath)];
      modelExports.push(await import(modelPath));
    } catch (error) {
      console.log(
        'Cannot load module:',
        modelPath,
        '\nError:',
        error,
        '\nSkipping...'
      );
    }
  }

  // Add the resources of the modules, which may relate to the project models
  if (isModuleEnabled(modules, '@appweaver/data')) {
    for (const enabled of modules) {
      const exports = await enabled.module.resources?.();
      if (!exports) {
        continue;
      }
      modelExports.push(exports);
      if (registeredByModules && shipsResourceRegistry(enabled)) {
        for (const model of exportedModels(exports)) {
          registeredByModules.add(model.name);
        }
      }
    }
  }

  for (const modelExport of modelExports) {
    for (const model of exportedModels(modelExport)) {
      models[model.name] = model;
    }
  }

  if (Object.keys(models).length === 0) {
    console.log(
      'No resource models exports found matching pattern:',
      modelPattern
    );
  }

  // Leave out the models of the framework the application does not use
  if (prune) {
    const { pruneUnusedModels } = await import('@appweaver/data/internal');
    pruneUnusedModels(
      models,
      modules.flatMap(({ module }) => module.seeders ?? [])
    );
  }

  // Resolve the schemas referencing the primary key of another model, now that
  // every model is registered
  relinkResourceModels(models);

  return models;
}

/** Returns the resource models of the exports of a model file or of the resources of a module. */
function exportedModels(exports: any): ResourceModel[] {
  const value = exports?.default ?? exports;
  if (isResourceModel(value)) {
    return [value];
  }
  return Object.values(value ?? {}).filter((maybeModel) =>
    isResourceModel(maybeModel)
  );
}

/**
 * Checks if a module package ships declaration files registering models in the `ResourceRegistry` of
 * `@appweaver/common`, which a declaration of the project would conflict with.
 *
 * @param {EnabledModule} enabled - The enabled module.
 * @return {boolean} `true` for a package module whose declaration files augment the registry.
 */
export function shipsResourceRegistry({
  source,
  path: manifestPath
}: EnabledModule): boolean {
  if (source !== 'package' || !manifestPath) {
    return false;
  }
  let root = path.dirname(manifestPath);
  while (!fs.existsSync(path.join(root, 'package.json'))) {
    const parent = path.dirname(root);
    if (parent === root) {
      return false;
    }
    root = parent;
  }
  return declarationFiles(root).some((file) =>
    /interface\s+ResourceRegistry\b/.test(fs.readFileSync(file, 'utf8'))
  );
}

/** Lists the declaration files of a directory, leaving out the dependencies. */
function declarationFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : declarationFiles(entryPath);
    }
    return entry.name.endsWith('.d.ts') ? [entryPath] : [];
  });
}
