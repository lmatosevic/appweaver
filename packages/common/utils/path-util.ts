import path from 'node:path';
import { glob } from 'glob';

/**
 * Resolves the application source path based on provided build, target, and fallback paths with an optional override
 * path. The resolved path will point to the directory or file which can be accessed by the current runtime.
 *
 * @param {string} buildPath - The base directory for the build output.
 * @param {string} targetPath - The target directory path relative to the build output.
 * @param {string} [overridePath] - An optional override path to be used as the resolved path if provided.
 * @param {string} [fallbackPath='.'] - The fallback path to use if no other resolution is appropriate.
 * @return {string} The resolved absolute path based on the provided parameters and runtime environment.
 */
export function resolveSourcePath(
  buildPath: string,
  targetPath: string,
  overridePath?: string,
  fallbackPath: string = '.'
): string {
  if (overridePath) {
    return path.resolve(overridePath);
  }

  if (isTypeScriptRuntime() && targetPath) {
    return path.resolve(targetPath);
  }

  if (buildPath && targetPath) {
    return path.resolve(path.join(buildPath, targetPath));
  }

  return path.join(process.cwd(), fallbackPath);
}

/**
 * Sanitizes a file path by replacing the file extension from `.ts` to `.js`
 * if the runtime environment is not Bun.
 *
 * @param {string} filePath - The file path to sanitize.
 * @return {string} The sanitized file path.
 */
export function sanitizePath(filePath: string): string {
  if (isTypeScriptRuntime()) {
    return filePath;
  }
  return filePath.replace(/\.ts$/i, '.js');
}

/**
 * Checks if the current execution entry point is a TypeScript file and
 * if the application is running on the Bun runtime.
 *
 * @return {boolean} Returns `true` if the main execution file is a TypeScript file
 * and the runtime matches the Bun configuration, otherwise `false`.
 */
export function isTypeScriptRuntime(): boolean {
  const mainPath = require.main?.filename || process.argv[1];
  const relativeMainPath = mainPath.replace(`${process.cwd()}${path.sep}`, '');
  return (
    (path.extname(mainPath) === '.ts' ||
      relativeMainPath.includes('node_modules')) &&
    typeof globalThis['Bun'] !== 'undefined'
  );
}

/**
 * Finds files matching a specific glob pattern within a given directory.
 *
 * @param {string} pattern - The glob pattern to match files against.
 * @param {string} cwd - The base directory to search files within.
 * @param {boolean} [stripOverlapping=true] - Whether to remove overlapping paths between a pattern and cwd from a glob
 * pattern before searching for files.
 * @return {Promise<string[]>} A promise that resolves to a sorted array of absolute file paths matching the pattern.
 */
export async function findFilesByPattern(
  pattern: string,
  cwd: string,
  stripOverlapping: boolean = true
): Promise<string[]> {
  // Add project files using a sanitized glob pattern
  const filePaths = sanitizePath(pattern);
  const filePattern = stripOverlapping
    ? stripOverlappingPath(filePaths, cwd)
    : filePaths;

  const foundFiles = await glob(filePattern, { cwd, absolute: true });

  // Sort is needed since glob returns files in non-deterministic order
  // depending on the filesystem implementation
  return foundFiles.sort();
}

/**
 * Strips overlapping segments between the current working directory (cwd) and a given pattern,
 * returning the remaining path relative to the cwd.
 *
 * @param {string} pattern - The input path pattern to process and compare with the current working directory (cwd).
 * @param {string} cwd - The current working directory against which the pattern will be compared.
 * @return {string} The remaining non-overlapping path segment of the pattern, relative to the cwd. If there is no
 *                  overlap, returns the original pattern prefixed with './'.
 */
function stripOverlappingPath(pattern: string, cwd: string): string {
  const normalize = (p: string): string => {
    return p.replace(/\\/g, '/').replace(/^\.\//, '');
  };

  const patSeg = normalize(pattern).split('/').filter(Boolean);
  const cwdSeg = normalize(cwd).split('/').filter(Boolean);

  // find longest k where last k segments of cwd == first k segments of a pattern
  let k = Math.min(cwdSeg.length, patSeg.length);
  for (; k > 0; k--) {
    const cwdTail = cwdSeg.slice(-k).join('/');
    const patHead = patSeg.slice(0, k).join('/');
    if (cwdTail === patHead) {
      break;
    }
  }

  const remaining = patSeg.slice(k).join('/');
  return remaining ? `./${remaining}` : './';
}
