import path from 'node:path';
import fs from 'node:fs';
import { register } from 'ts-node';
import { capitalize, ResourceModelSchema } from '@appweaver/common';

export function loadResources(
  dirName: string = 'resources'
): Record<string, ResourceModelSchema> {
  const cwd = process.cwd();
  const resourcesDir = path.join(cwd, 'src', dirName);

  if (!fs.existsSync(resourcesDir)) {
    console.error('Resources directory not found.');
    return {};
  }

  // Register ts-node to handle .ts imports
  register({
    transpileOnly: true,
    compilerOptions: {
      module: 'CommonJS'
    }
  });

  const directories = fs
    .readdirSync(resourcesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory());

  const resources: Record<string, ResourceModelSchema> = {};

  for (const dir of directories) {
    const dirName = dir.name;
    const modelPath = path.join(resourcesDir, dirName, 'model.ts');

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
