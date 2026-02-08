import path from 'node:path';
import fs from 'node:fs';
import { register } from 'ts-node';
import { capitalize, ResourceModelSchema } from '@appweaver/common';

export function loadResources(
  resourcesDir: string
): Record<string, ResourceModelSchema> {
  const cwd = process.cwd();
  const resourcesPath = path.join(cwd, resourcesDir);

  if (!fs.existsSync(resourcesPath)) {
    console.error('Resources directory not found.');
    return {};
  }

  // Register ts-node to handle .ts imports
  register({
    transpileOnly: true,
    compilerOptions: {
      module: 'CommonJS',
      target: 'ES2024',
    }
  });

  const directories = fs
    .readdirSync(resourcesPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory());

  const resources: Record<string, ResourceModelSchema> = {};

  for (const dir of directories) {
    const dirName = dir.name;
    const modelPath = path.join(resourcesPath, dirName, 'model.ts');

    if (!fs.existsSync(modelPath)) {
      console.log(
        `Resource ${dirName} does not export model schema. Skipping.`
      );
      continue;
    }

    // Clear cache to ensure fresh model data
    delete require.cache[require.resolve(modelPath)];
    const modelExport = require(modelPath);
    const model: ResourceModelSchema = modelExport.default || modelExport;

    const modelName = model.name || capitalize(dirName);

    resources[modelName] = model;
  }

  return resources;
}
