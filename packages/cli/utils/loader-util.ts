import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { glob } from 'glob';
import { register } from 'ts-node';
import { config, isResourceModel, ResourceModel } from '@appweaver/common';

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
 * Loads and registers resource models from the specified file pattern.
 *
 * This method scans for model files that match the given pattern,
 * imports them, and checks if they conform to the resource model schema.
 * Valid models are added to the returned collection.
 *
 * @param {string} [modelPattern] - The glob pattern used to locate model files. The default value is used from config.
 * @return {Promise<Record<string, ResourceModel>>} A promise resolving to an object containing the loaded resource models,
 * where the keys are the model names and the values are the associated ResourceModel objects.
 */
export async function loadModels(
  modelPattern: string
): Promise<Record<string, ResourceModel>> {
  const cwd = process.cwd();

  register({
    transpileOnly: true,
    compilerOptions: {
      module: 'CommonJS'
    }
  });

  const models: Record<string, ResourceModel> = {};

  const modelPaths: string[] = [];

  // Add project files using a pattern
  const projectModelPaths = await glob(modelPattern, { cwd, absolute: true });

  // Sort is needed since glob returns files in non-deterministic order
  projectModelPaths.sort();
  modelPaths.push(...projectModelPaths);

  // Add exported core module resources
  modelPaths.push('@appweaver/core/resources');

  // Add additional modules from config
  for (const module of config.APP_AUTOLOAD_MODULES) {
    modelPaths.push(module);
  }

  for (const modelPath of modelPaths) {
    let modelExport: any;
    try {
      // Clear cache to ensure fresh model data
      delete require.cache[require.resolve(modelPath)];
      modelExport = await import(modelPath);
    } catch (error) {
      console.log(
        'Cannot load module:',
        modelPath,
        '\nError:',
        error,
        '\nSkipping...'
      );
      continue;
    }

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

  return models;
}
