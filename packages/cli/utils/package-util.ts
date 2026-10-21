/**
 * Imports a module of a package the command needs, i.e. `@appweaver/data` of `weaver generate`, exiting with a
 * message naming the package when the project does not have it, since the CLI requires only `@appweaver/core`.
 *
 * @param {string} specifier - The module, i.e. `@appweaver/data` or `@appweaver/data/config`.
 * @param {string} command - The command needing it, i.e. `generate`.
 * @return {Promise<T>} The exports of the module.
 */
export async function importPackage<T = any>(
  specifier: string,
  command: string
): Promise<T> {
  const packageName = specifier.split('/').slice(0, 2).join('/');
  try {
    return await import(specifier);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' &&
      String((error as Error).message).includes(packageName)
    ) {
      console.error(
        `weaver ${command} needs the ${packageName} package, install it with: npm install ${packageName}`
      );
      process.exit(1);
    }
    throw error;
  }
}
