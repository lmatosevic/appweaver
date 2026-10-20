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
  /** Storage provider: `auto` (`local` unless a module of another driver is enabled), `local`, `none`, or the
   * module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});

export const imageConfig = defineConfig('image', {
  /** Image processor transforming the uploaded images: `auto` (`sharp` when its module is enabled, otherwise none,
   * keeping the images as they are uploaded), `sharp`, `none`, or the module path of an implementation. Default:
   * `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
