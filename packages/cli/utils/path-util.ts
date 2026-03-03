import path from 'node:path';

/**
 * Computes the relative path from the directory of the first path to the second path.
 *
 * @param {string} firstPath - The base path used to calculate the relative path.
 * @param {string} otherPath - The target path for which the relative path will be calculated.
 * @return {string} The relative path from the `firstPath` directory to `otherPath`, normalized with forward slashes.
 */
export function relativePathFrom(firstPath: string, otherPath: string): string {
  const schemaDir = path.dirname(path.resolve(firstPath));
  const clientAbs = path.resolve(otherPath);

  let rel = path.relative(schemaDir, clientAbs);

  if (!rel.startsWith('.') && rel !== '') {
    rel = `.${path.sep}${rel}`;
  } else if (rel === '') {
    rel = '.';
  }

  return rel.replace(/\\/g, '/');
}

/**
 * Asserts that the `childPath` is located inside the `basePath`. If the condition
 * is not met, logs the specified error message and terminates the process.
 *
 * @param basePath The base directory path to validate against.
 * @param childPath The path to validate as being inside the `basePath`.
 * @param message The error message to log if the assertion fails.
 */
export function assertPathInside(
  basePath: string,
  childPath: string,
  message: string
): void {
  if (!isPathInside(basePath, childPath)) {
    console.error(message);
    process.exit(1);
  }
}

/**
 * Determines whether a given child path is located within a specific base path.
 *
 * @param {string} basePath - The base directory path to check against.
 * @param {string} childPath - The child path to evaluate.
 * @return {boolean} Returns true if the child path is inside the base path; otherwise, false.
 */
export function isPathInside(basePath: string, childPath: string): boolean {
  const base = path.resolve(basePath);
  const child = path.resolve(childPath);

  // Add a trailing separator so `/temp/dir2` is not matched by `/temp/dir`
  const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;

  return child.startsWith(baseWithSep);
}
