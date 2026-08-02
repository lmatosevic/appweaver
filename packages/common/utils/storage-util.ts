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

/**
 * Finds the reserved storage path a given file path (or file name pattern) falls under. A path is reserved when it is
 * equal to a reserved entry (a full file name) or when it is contained in it (a reserved directory), compared segment
 * by segment from the storage root. Comparison is case-insensitive, so that a reservation cannot be bypassed on
 * case-insensitive file systems.
 *
 * Reserved entries are plain paths, not patterns — no wildcard or regular expression syntax is supported. A leading
 * slash in a reserved entry is ignored, since every entry is relative to the storage root.
 *
 * @param {string} filePath - The file path, file name, or file name pattern to check.
 * @param {string[]} [reservedPaths] - The reserved paths, usually taken from the `STORAGE_RESERVED_PATHS` config.
 * @return {string | null} The matched reserved path, or `null` when the file path is not reserved.
 */
export function findReservedStoragePath(
  filePath: string,
  reservedPaths: string[] = []
): string | null {
  if (!Array.isArray(reservedPaths) || reservedPaths.length === 0) {
    return null;
  }

  const normalizedPath = normalizeStoragePath(filePath);
  if (normalizedPath === null) {
    return null;
  }

  const segments = normalizedPath.toLowerCase().split('/');

  for (const reservedPath of reservedPaths) {
    if (typeof reservedPath !== 'string') {
      continue;
    }

    // Reserved entries are always relative to the storage root, so a leading
    // separator is stripped before normalization rejects it as an absolute path.
    // Surrounding whitespace is trimmed as well, since entries may come from a
    // comma-separated environment variable.
    const normalizedReserved = normalizeStoragePath(
      reservedPath.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    );
    if (normalizedReserved === null) {
      continue;
    }

    const reservedSegments = normalizedReserved.toLowerCase().split('/');
    if (reservedSegments.length > segments.length) {
      continue;
    }

    if (reservedSegments.every((segment, i) => segment === segments[i])) {
      return reservedPath;
    }
  }

  return null;
}

/**
 * Checks whether a file path (or file name pattern) is placed inside, or is equal to, one of the reserved storage
 * paths. See {@link findReservedStoragePath} for the matching rules.
 *
 * @param {string} filePath - The file path, file name, or file name pattern to check.
 * @param {string[]} [reservedPaths] - The reserved paths, usually taken from the `STORAGE_RESERVED_PATHS` config.
 * @return {boolean} True when the file path is reserved, false otherwise.
 */
export function isReservedStoragePath(
  filePath: string,
  reservedPaths: string[] = []
): boolean {
  return findReservedStoragePath(filePath, reservedPaths) !== null;
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
