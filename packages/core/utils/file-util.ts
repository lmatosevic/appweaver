import {
  config,
  FilesConfig,
  isString,
  replacePatternVariables,
  textToBytes
} from '@appweaver/common';
import { File } from '../types';

export function parseRange(range?: string): { start: number; end?: number } {
  if (!range) {
    return { start: 0 };
  }

  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : undefined;
  return { start, end };
}

export function maxFileSize(fileConfig: FilesConfig): number {
  const sizes = Object.values(fileConfig)
    .map((conf) => sizeInBytes(conf.maxSize))
    .filter((v) => v > 0);

  if (!sizes.length) {
    return textToBytes(config.SERVER_BODY_MAX_SIZE);
  }

  return Math.max(...sizes);
}

export function sizeInBytes(size?: string | number): number {
  return isString(size) ? textToBytes(size) : 0;
}

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

export function sanitizeFilename(fileName: string): string {
  return fileName.replace(/[\\:*?"<>|]/g, '');
}

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
