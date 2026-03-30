import path from 'node:path';
import { config, Runtime } from '@appweaver/common';

/**
 * Checks if the current execution entry point is a TypeScript file and
 * if the application is running on the Bun runtime.
 *
 * @return {boolean} Returns `true` if the main execution file is a TypeScript file
 * and the runtime matches the Bun configuration, otherwise `false`.
 */
export function isTypeScriptRuntime(): boolean {
  const mainPath = require.main?.filename || process.argv[1];
  return path.extname(mainPath) === '.ts' && config.APP_RUNTIME === Runtime.Bun;
}

/**
 * Resolves the scan path for the application based on the provided override path
 * or default configuration values.
 *
 * @param {string} [overridePath] - An optional path that overrides other configuration-based paths.
 * @return {string} The resolved absolute scan path.
 */
export function resolveScanPath(overridePath?: string): string {
  if (overridePath) {
    return path.resolve(overridePath);
  }

  if (isTypeScriptRuntime() && config.APP_SCAN_PATH) {
    return path.resolve(config.APP_SCAN_PATH);
  }

  if (config.APP_BUILD_PATH && config.APP_SCAN_PATH) {
    return path.resolve(path.join(config.APP_BUILD_PATH, config.APP_SCAN_PATH));
  }

  return path.join(process.cwd(), './dist/src');
}

/**
 * Resolves and returns the absolute path to the seeders directory based on the provided configuration.
 *
 * @param {string} [overridePath] - An optional path to override the default seeder path resolution.
 * @return {string} The resolved absolute path to the seeders' directory.
 */
export function resolveSeedersPath(overridePath?: string): string {
  if (overridePath) {
    return path.resolve(overridePath);
  }

  if (isTypeScriptRuntime() && config.APP_SCAN_PATH) {
    return path.resolve(config.DATABASE_SEEDERS_DIR_PATH);
  }

  if (config.APP_BUILD_PATH && config.DATABASE_SEEDERS_DIR_PATH) {
    return path.resolve(
      path.join(config.APP_BUILD_PATH, config.DATABASE_SEEDERS_DIR_PATH)
    );
  }

  return path.join(process.cwd(), './dist/database/seeders');
}
