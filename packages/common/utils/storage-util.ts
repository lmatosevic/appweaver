import path from 'node:path';

/**
 * Normalizes a storage file path into a safe, relative POSIX path. Backslashes are unified into forward slashes,
 * redundant and empty segments are removed, and any path not confined to the storage root is rejected.
 *
 * A path is considered unsafe (and `null` is returned) when it is empty, contains a control character,
 * is absolute (POSIX root, Windows drive letter, or UNC share) or contains a `..` traversal segment.
 *
 * @param {string} fileName - The file name/path to normalize.
 * @return {string | null} The normalized relative path, or `null` when the path is unsafe.
 */
export function normalizeStoragePath(fileName: string): string | null {
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    return null;
  }

  // Control characters are never valid in a stored file name, and a NUL byte
  // can truncate the path in native calls.
  if (hasControlCharacters(fileName)) {
    return null;
  }

  const unifiedPath = fileName.replace(/\\/g, '/');

  // Absolute paths would escape the storage root once resolved against it.
  if (unifiedPath.startsWith('/') || /^[a-zA-Z]:/.test(unifiedPath)) {
    return null;
  }

  const segments: string[] = [];
  for (const segment of unifiedPath.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      return null;
    }
    segments.push(segment);
  }

  return segments.length > 0 ? segments.join('/') : null;
}

/**
 * Resolves a file name into an absolute path confined to the given storage root directory.
 *
 * @param {string} rootPath - The storage root directory.
 * @param {string} fileName - The file name/path relative to the storage root.
 * @return {string | null} The absolute resolved path, or `null` when the file name escapes the storage root.
 */
export function resolveStoragePath(
  rootPath: string,
  fileName: string
): string | null {
  const normalizedName = normalizeStoragePath(fileName);
  if (normalizedName === null) {
    return null;
  }

  const resolvedRoot = path.resolve(rootPath);
  const resolvedPath = path.resolve(resolvedRoot, normalizedName);

  // Second barrier against traversal, covering platform-specific path resolution.
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(resolvedRoot + path.sep)
  ) {
    return null;
  }

  return resolvedPath;
}

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}
