import fs from 'node:fs';
import path from 'node:path';
import {
  appConfig,
  isResourceAuthModel,
  isPlainObject,
  ResourceModel
} from '@appweaver/common';
import { databaseConfig } from '../../database/database-config';

/** The models of the auth data model, needed only by an application with an auth model. */
const authModelNames = [
  'Role',
  'Permission',
  'ApiKey',
  'OneTimeToken',
  'ConnectedAccount'
];

/**
 * Removes the models of the framework an application does not use, so its database gets none of their tables: the
 * auth data model without an auth model, the File model without a model declaring `files`, and the Seeder model
 * without a seeders directory, of the application or of an enabled module.
 *
 * @param {Record<string, ResourceModel>} models - The loaded models, keyed by their name, changed in place.
 * @param {string[]} [moduleSeeders=[]] - The seeders directories of the enabled modules.
 * @return {string[]} The names of the removed models.
 */
export function pruneUnusedModels(
  models: Record<string, ResourceModel>,
  moduleSeeders: string[] = []
): string[] {
  const all = Object.values(models);
  const unused: string[] = [];

  if (!all.some((model) => isResourceAuthModel(model))) {
    unused.push(...authModelNames);
  }

  const hasFiles = all.some(
    (model) =>
      model.name !== 'File' &&
      isPlainObject(model.config.files) &&
      Object.keys(model.config.files).length > 0
  );
  if (!hasFiles) {
    unused.push('File');
  }

  if (!hasSeedersDirectory() && moduleSeeders.length === 0) {
    unused.push('Seeder');
  }

  const removed = unused.filter((name) => name in models);
  for (const name of removed) {
    delete models[name];
  }
  return removed;
}

/** Checks if the seeders directory exists, in the sources or in the build output. */
function hasSeedersDirectory(): boolean {
  const seedersPath = databaseConfig.SEEDERS_DIR_PATH;
  return [
    path.resolve(seedersPath),
    path.resolve(appConfig.BUILD_PATH, seedersPath)
  ].some((directory) => fs.existsSync(directory));
}
