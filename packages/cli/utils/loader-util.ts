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
  isModuleEnabled,
  loadModuleParts
} from '@appweaver/core/app/discover-modules';
import { pruneUnusedModels } from '@appweaver/core/resource/utils/prune-util';

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
 * Loads and registers resource models from the enabled modules and the specified file pattern.
 *
 * This method discovers the modules of the project from its sources, takes the models of their resources, then scans
 * for model files that match the given pattern, imports them, and checks if they conform to the resource model schema.
 * Valid models are added to the returned collection, a model of the project replacing a model of a module.
 *
 * @param {string} [modelPattern] - The glob pattern used to locate model files. The default value is used from config.
 * @param {boolean} [prune=true] - Whether to leave out the framework models the project does not use (the auth data
 * model without an auth model, File without file fields, Seeder without a seeders directory).
 * @return {Promise<Record<string, ResourceModel>>} A promise resolving to an object containing the loaded resource models,
 * where the keys are the model names and the values are the associated ResourceModel objects.
 */
export async function loadModels(
  modelPattern: string,
  prune: boolean = true
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
    modelExports.push(...(await loadModuleParts(modules, 'resources')));
  }

  for (const modelExport of modelExports) {
    const modelSchema = modelExport.default || modelExport;

    // Add only exports that satisfy the resource model schema requirements
    if (isResourceModel(modelSchema)) {
      models[modelSchema.name] = modelSchema;
    } else {
      for (const maybeSchema of Object.values(modelSchema)) {
        if (isResourceModel(maybeSchema)) {
          models[maybeSchema.name] = maybeSchema;
        }
      }
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
    pruneUnusedModels(models);
  }

  // Resolve the schemas referencing the primary key of another model, now that
  // every model is registered
  relinkResourceModels(models);

  return models;
}
