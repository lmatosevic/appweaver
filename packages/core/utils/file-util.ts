import {
  config,
  FilesConfig,
  replacePatternVariables
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
    return config.SERVER_BODY_LIMIT_BYTES;
  }

  return Math.max(...sizes);
}

export function sizeInBytes(size?: string | number): number {
  return typeof size === 'string' ? sizeTextToBytes(size) : 0;
}

export function sizeTextToBytes(sizeText: string): number {
  let sizeInBytes = 0;
  const units = ['k', 'm', 'g', 't'];

  if (!sizeText) {
    return sizeInBytes;
  }

  const matches = sizeText.matchAll(/([\d.]*)\s*([a-zA-Z]*)/g); // e.g. 1.52 MB
  const match = matches.next();

  if (match && match.value && match.value.length > 0) {
    let multiplier = 1;
    const value = match.value[1];
    const unit = match.value[2];

    if (unit) {
      const index = units.indexOf(unit.toLowerCase().replace('b', ''));
      if (index !== -1) {
        multiplier = Math.pow(1000, index + 1);
      }
    }

    let numericalValue = 1;
    if (value) {
      const number = parseFloat(value);
      if (!isNaN(number)) {
        numericalValue = number;
      }
      sizeInBytes = numericalValue * multiplier;
    }
  }

  return Math.round(sizeInBytes);
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
