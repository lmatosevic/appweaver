import fsp from 'node:fs/promises';
import { config, logger } from '@appweaver/common';
import { findFilesByPattern, importModule } from '../utils';

/**
 * Loads and initializes modules exported from the application using the provided base directory and file pattern.
 *
 * @param {string} [baseDir] - The base directory containing the module files to load.
 * @param {string} [moduleFilesPattern] - Path patterns for loading files that export application logic like:
 * models, routes, plugins, scheduled jobs, queue workers, etc.
 * @return {Promise<void>} A promise that resolves when the modules are successfully loaded,
 * or rejects if an error occurs during the process.
 */
export async function loadModules(
  baseDir?: string,
  moduleFilesPattern?: string
): Promise<void> {
  const cwd = baseDir ?? process.cwd();
  const pathPattern = moduleFilesPattern || config.APP_SCAN_FILES_PATTERN;

  // Find all project files matching provided glob pattern
  const modulePaths = await findFilesByPattern(pathPattern, cwd);

  for (const path of modulePaths) {
    await loadModule(path);
  }
}

/**
 * Loads a module from the specified file path. Reads the file content and
 * ensures it meets the criteria before attempting to dynamically import the module.
 * Logs an error if module loading fails.
 *
 * @param {string} modulePath - The file path of the module to be loaded.
 * @return {Promise<void>} A promise that resolves when the module is successfully loaded or rejects if an error occurs.
 */
async function loadModule(modulePath: string): Promise<void> {
  try {
    const fileContent = await fsp.readFile(modulePath, 'utf8');
    if (fileContent.split('\n').length < 3) {
      return;
    }
  } catch (error) {
    logger.error(error, `Error while loading module`);
    return;
  }

  const { error } = await importModule(modulePath);
  if (error) {
    throw error;
  }
}
