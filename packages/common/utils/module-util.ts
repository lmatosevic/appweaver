import path from 'node:path';
import { sanitizePath } from './path-util';

type ValueOrError<T> =
  | { value: T; error: null }
  | { value: null; error: Error };

/**
 * Dynamically imports a module from a given file path and catches any errors.
 *
 * @param {string} filePath - The file path of the module to import. The path is adjusted for the current runtime.
 * @param {boolean} [failOnError=false] - If true, the function will throw an error if the module cannot be loaded.
 * @return A promise that resolves to an object containing the imported module's default or named export (under `value`)
 * or an error (under `error`).
 */
export async function importModule<T = any>(
  filePath: string,
  failOnError: boolean = false
): Promise<ValueOrError<T>> {
  try {
    const exportedValue = await import(sanitizePath(filePath));
    return { value: exportedValue.default || exportedValue, error: null };
  } catch (e) {
    if (failOnError) {
      throw e;
    }
    return { value: null, error: e as Error };
  }
}

/**
 * Dynamically imports a module from the specified file path and handles any errors during the process.
 *
 * @param {string} filePath - The file path of the module to require. The path is adjusted for the current runtime.
 * @param {boolean} [failOnError=false] - If true, the function will throw an error if the module cannot be loaded.
 * @return An object containing the imported module value or an error if the module could not be loaded. The `value`
 * property contains the default export or the complete exported module, and the `error` property contains the caught
 * error if an exception occurred.
 */
export function requireModule<T = any>(
  filePath: string,
  failOnError: boolean = false
): ValueOrError<T> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exportedValue = require(sanitizePath(filePath));
    return { value: exportedValue, error: null };
  } catch (e) {
    if (failOnError) {
      throw e;
    }
    return { value: null, error: e as Error };
  }
}

/**
 * Loads a module from the specified class path, local project path, or from the node_modules directory.
 *
 * @param {string} baseDir - The base directory used to resolve relative and local class paths.
 * @param {string} classPath - The path to the module to be loaded. Can be a relative path (`../services/example`),
 * project source path (`@/features/services/example`), or node_modules package (`@appweaver/core/service/example`).
 * @param {boolean} [failOnError=false] - If true, the function will throw an error if the module cannot be loaded.
 * @return This function does not return a value. It loads a module and defines it if successful.
 */
export function loadModule<T = any>(
  baseDir: string,
  classPath: string,
  failOnError: boolean = false
): ValueOrError<T> {
  let modulePath: string;
  if (classPath.startsWith('@/')) {
    // Load module from the calling project source directory
    modulePath = path.join(baseDir, classPath.replace('@/', ''));
  } else if (classPath.startsWith('.')) {
    // Load from the core project directory
    modulePath = path.join(baseDir, classPath);
  } else {
    // Load from the node_modules directory
    modulePath = classPath;
  }

  // Try to import module from the class path
  const { value, error } = requireModule<T>(modulePath, false);

  // Handle errors or missing values for both required and optional modules
  if (!value || error) {
    const msg = `Loading '${classPath}' module failed: ${error}`;
    const err = error ?? new Error(msg);
    if (failOnError) {
      throw err;
    }
    return { value: null, error: err };
  }

  return { value: value, error: null };
}
