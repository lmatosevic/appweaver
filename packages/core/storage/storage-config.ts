import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const storageConfig = defineConfig('storage', {
  /** Base directory for file storage. Default: `'./storage'`. */
  PATH: Type.String({ default: './storage' }),
  /** Paths under the storage directory where files cannot be stored. Entries are relative to `STORAGE_PATH`
   *  (directory or file), matched case-insensitively. Default: `['keys']`. */
  RESERVED_PATHS: Type.Array(Type.String(), { default: ['keys'] }),
  /** File naming pattern for stored files. Default: `'{name}-{hash}.{extension}'`. */
  NAME_PATTERN: Type.String({ default: '{name}-{hash}.{extension}' }),
  /** File storage cache TTL in milliseconds. Default: `86400000` (24 hours). */
  CACHE_TTL: Type.Integer({ default: 86400000 }),
  /** URL prefix for file access routes. Default: `'/files'`. */
  FILES_ROUTE_PREFIX: Type.String({ default: '/files' }),
  /** Storage provider implementation path. Default: `'@appweaver/core/storage/filesystem-storage'`. */
  PROVIDER: Type.String({
    default: '@appweaver/core/storage/filesystem-storage'
  })
});
