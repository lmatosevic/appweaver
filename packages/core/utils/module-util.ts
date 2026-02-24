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
