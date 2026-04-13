import {
  config,
  FilesConfig,
  isString,
  replacePatternVariables,
  textToBytes
} from '@appweaver/common';
import { File } from '../types';

/**
 * Parses a range string and converts it into an object with start and end values.
 *
 * @param {string} [range] - The range string to parse, typically in the format "bytes=start-end".
 * @return {{start: number, end?: number}} An object containing the start value and an optional end value.
 */
export function parseRange(range?: string): { start: number; end?: number } {
  if (!range) {
    return { start: 0 };
  }

  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : undefined;
  return { start, end };
}

/**
 * Calculates the maximum file size allowed based on the provided file configuration.
 *
 * @param {FilesConfig} fileConfig - An object containing file configuration data, including maximum size for each file
 * type.
 * @return {number} The maximum size in bytes allowed for any file based on the given configuration.
 */
export function maxFileSize(fileConfig: FilesConfig): number {
  const sizes = Object.values(fileConfig)
    .map((conf) => sizeInBytes(conf.maxSize))
    .filter((v) => v > 0);

  if (!sizes.length) {
    return textToBytes(config.SERVER_BODY_MAX_SIZE);
  }

  return Math.max(...sizes);
}

/**
 * Converts a given size represented as a string or number into its equivalent size in bytes.
 *
 * @param {string | number} [size] - The size to be converted, either as a string or a number.
 * @return {number} The size in bytes. Returns 0 if the input is invalid or not provided.
 */
export function sizeInBytes(size?: string | number): number {
  return isString(size) ? textToBytes(size) : 0;
}

/**
 * Validates if the provided MIME type matches a given pattern or regular expression.
 *
 * @param {string} mimeType - The MIME type to validate.
 * @param {string|RegExp} [mimeTypeExp] - An optional pattern or regular expression to match the MIME type against.
 *                                       If not provided, the method will always return true.
 * @return {boolean} True if the MIME type matches the specified pattern or regular expression, false otherwise.
 */
export function isValidMimeType(
  mimeType: string,
  mimeTypeExp?: string | RegExp
): boolean {
  if (!mimeTypeExp) {
    return true;
  } else if (mimeTypeExp instanceof RegExp) {
    return mimeTypeExp.test(mimeType);
  } else {
    const regexPattern = mimeTypeExp
      .replace(/[.+?^$]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(mimeType);
  }
}

/**
 * Generates a file name based on a given name, an optional pattern, and a set of variables.
 *
 * @param {string} name The original file name including its extension.
 * @param {string} [pattern] An optional pattern to customize the generated file name. If not provided, a default
 * pattern will be used.
 * @param {Record<string, any>} [variables={}] Additional variables to replace in the pattern. These can include custom
 * placeholders to dynamically generate the file name.
 * @return {string} The generated, sanitized file name based on the provided or default pattern.
 */
export function generateFileName(
  name: string,
  pattern?: string,
  variables: Record<string, any> = {}
): string {
  const nameParts = name.split('.');
  let extension: string | undefined = '';
  let nameWithoutExtension = name;

  if (nameParts.length > 1) {
    extension = nameParts.pop();
    nameWithoutExtension = nameParts.join('.');
  }

  const defaultPattern =
    config.STORAGE_NAME_PATTERN ?? '{name}-{hash}.{extension}';

  let fileName = replacePatternVariables(pattern ?? defaultPattern, {
    name: nameWithoutExtension,
    extension,
    ...variables
  });

  fileName = sanitizeFilename(fileName);

  fileName = fileName.endsWith('.')
    ? fileName.substring(0, fileName.length - 1)
    : fileName;

  return fileName || name;
}

/**
 * Sanitizes a given filename by removing invalid characters that are not allowed in file systems.
 *
 * @param fileName The original filename to sanitize.
 * @return A sanitized filename with invalid characters removed.
 */
export function sanitizeFilename(fileName: string): string {
  return fileName.replace(/[\\:*?"<>|]/g, '');
}

/**
 * Aggregates the provided files into a structured object based on the given configuration.
 *
 * @param {File[]} files - An array of file objects to be processed and aggregated.
 * @param {FilesConfig} filesConfig - An object that defines the configuration for each file field, including whether
 * the field supports multiple files.
 * @return {Record<string, File | File[] | null>} A record where keys correspond to the configured fields, and values
 * are either a single file, an array of files, or null if no files match the field.
 */
export function aggregateFiles(
  files: File[],
  filesConfig: FilesConfig
): Record<string, File | File[] | null> {
  const aggregated: Partial<Record<string, File | File[] | null>> =
    Object.entries(filesConfig)
      .map(([field, value]) => ({ [field]: value.array ? [] : null }))
      .reduce((acc, obj) => Object.assign(acc, obj), {});

  for (const file of files) {
    const resourceField = file.resourceField;

    if (resourceField) {
      if (filesConfig[resourceField].array) {
        if (!aggregated[resourceField]) {
          aggregated[resourceField] = [];
        }
        (aggregated[resourceField] as File[]).push(file);
      } else {
        aggregated[resourceField] = file;
      }
    }
  }

  return aggregated as Record<string, File | File[]>;
}
