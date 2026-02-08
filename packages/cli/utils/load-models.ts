import { globSync } from 'glob';
import { register } from 'ts-node';
import { ResourceModelSchema } from '@appweaver/common';

export function loadModels(
  modelPattern: string
): Record<string, ResourceModelSchema> {
  const cwd = process.cwd();

  register({
    transpileOnly: true,
    compilerOptions: {
      module: 'CommonJS'
    }
  });

  const modelPaths = globSync(modelPattern, { cwd, absolute: true });

  if (modelPaths.length === 0) {
    console.log('No models found matching pattern:', modelPattern);
    return {};
  }

  const resources: Record<string, ResourceModelSchema> = {};

  for (const modelPath of modelPaths) {
    // Clear cache to ensure fresh model data
    delete require.cache[require.resolve(modelPath)];

    const modelExport = require(modelPath);
    const modelSchema: ResourceModelSchema = modelExport.default || modelExport;

    // Add only exports that satisfy the resource model schema requirements
    if (modelSchema.name && modelSchema.model) {
      resources[modelSchema.name] = modelSchema;
    }
  }

  return resources;
}
