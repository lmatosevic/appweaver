import path from 'node:path';

/**
 * Dynamically imports a module from a given file path and catches any errors.
 *
 * @param {string} filePath - The file path of the module to import. The path should point to a TypeScript file,
 * and it will automatically resolve to the corresponding JavaScript file.
 * @param {boolean} [failOnError=false] - If true, the function will throw an error if the module cannot be loaded.
 * @return A promise that resolves to an object containing the imported module's default or named export (under `value`)
 * or an error (under `error`).
 */
export async function importModule<T = any>(
  filePath: string,
  failOnError: boolean = false
): Promise<{ value: T | null; error: Error | null }> {
  try {
    const jsPath = filePath.replace(/\.ts$/i, '.js');
    const exportedValue = await import(jsPath);
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
 * @param {string} filePath - The file path of the module to require. If the file has a `.ts` extension, it will be
 * replaced with `.js`.
 * @param {boolean} [failOnError=false] - If true, the function will throw an error if the module cannot be loaded.
 * @return An object containing the imported module value or an error if the module could not be loaded. The `value`
 * property contains the default export or the complete exported module, and the `error` property contains the caught
 * error if an exception occurred.
 */
export function requireModule<T = any>(
  filePath: string,
  failOnError: boolean = false
): { value: T | null; error: Error | null } {
  try {
    const jsPath = filePath.replace(/\.ts$/i, '.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exportedValue = require(jsPath);
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
 * @param {string} baseDir - The base directory used to resolve relative class paths.
 * @param {string} classPath - The path to the module to be loaded. Can be an absolute path, project source path, or
 *                             node_modules package.
 * @param {boolean} [failOnError=false] - If true, the function will throw an error if the module cannot be loaded.
 * @return This function does not return a value. It loads a module and defines it if successful.
 */
export function loadModule<T = any>(
  baseDir: string,
  classPath: string,
  failOnError: boolean = false
): { value: T | null; error: Error | null } {
  let modulePath: string;
  if (classPath.startsWith('@/')) {
    // Load module from the calling project source directory
    modulePath = path.join(baseDir, classPath.replace('@/', ''));
  } else if (classPath.startsWith('.')) {
    // Load from the core project directory
    modulePath = path.join(__dirname, classPath);
  } else {
    // Load from the node_modules directory
    modulePath = classPath;
  }

  // Try to import module from the class path
  const { value, error } = requireModule<T>(modulePath, false);

  // Handle errors or missing values for both required and optional modules
  if (!value || error) {
    const msg = `Loading '${classPath}' module failed: ${error}`;
    if (failOnError) {
      throw error ?? new Error(msg);
    }
    return { value: null, error };
  }

  return { value: value, error: null };
}
