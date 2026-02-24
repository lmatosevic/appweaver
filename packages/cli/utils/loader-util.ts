import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import { register } from 'ts-node';
import { isResourceModel, ResourceModel } from '@appweaver/core';

export function loadPackageJson(): Record<string, string> {
  let pkgPath = path.join(__dirname, '../../package.json');
  if (!fs.existsSync(pkgPath)) {
    pkgPath = path.join(__dirname, '../package.json');
  }

  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

export function loadModels(
  modelPattern: string
): Record<string, ResourceModel> {
  const cwd = process.cwd();

  register({
    transpileOnly: true,
    compilerOptions: {
      module: 'CommonJS'
    }
  });

  const models: Record<string, ResourceModel> = {};

  const modelPaths = globSync(modelPattern, { cwd, absolute: true });

  // Add exported core module resource models
  modelPaths.push('@appweaver/core');

  if (modelPaths.length === 0) {
    console.log('No models found matching pattern:', modelPattern);
    return models;
  }

  for (const modelPath of modelPaths) {
    let modelExport: any;
    try {
      // Clear cache to ensure fresh model data
      delete require.cache[require.resolve(modelPath)];
      modelExport = require(modelPath);
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
