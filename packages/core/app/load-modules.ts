import path from 'node:path';
import fsp from 'node:fs/promises';
import { logger } from '@appweaver/common';
import { importModule } from '../utils';

/**
 * Loads and initializes modules from the specified directory using barrel exports.
 *
 * @param {string} baseDir - The base directory containing the module files to load.
 * @return {Promise<void>} A promise that resolves when the modules are successfully loaded,
 * or rejects if an error occurs during the process.
 */
export async function loadModules(baseDir: string): Promise<void> {
  const moduleIndexPath = path.join(baseDir, 'index.js');
  try {
    const fileContent = await fsp.readFile(moduleIndexPath, 'utf8');
    if (fileContent.split('\n').length < 3) {
      return;
    }
  } catch (err) {
    logger.error(`Error while loading module: ${err}`);
    return;
  }

  const { error } = await importModule(moduleIndexPath);
  if (error) {
    throw error;
  }
}
