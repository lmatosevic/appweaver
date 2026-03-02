/**
 * Dynamically imports a module from a given file path and catches any errors.
 *
 * @param {string} filePath - The file path of the module to import. The path should point to a TypeScript file,
 * and it will automatically resolve to the corresponding JavaScript file.
 * @return A promise that resolves to an object containing the imported module's default or named export (under `value`)
 * or an error (under `error`).
 */
export async function importModule<T = any>(
  filePath: string
): Promise<{ value: T | null; error: Error | null }> {
  try {
    const jsPath = filePath.replace(/\.ts$/i, '.js');
    const exportedValue = await import(jsPath);
    return { value: exportedValue.default || exportedValue, error: null };
  } catch (e) {
    return { value: null, error: e as Error };
  }
}

/**
 * Dynamically imports a module from the specified file path and handles any errors during the process.
 *
 * @param {string} filePath - The file path of the module to require. If the file has a `.ts` extension, it will be
 * replaced with `.js`.
 * @param {boolean} [failOnError=true] - If true, the function will throw an error if the module cannot be loaded.
 * @return An object containing the imported module value or an error if the module could not be loaded. The `value`
 * property contains the default export or the complete exported module, and the `error` property contains the caught
 * error if an exception occurred.
 */
export function requireModule<T = any>(
  filePath: string,
  failOnError: boolean = true
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
