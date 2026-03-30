import path from 'node:path';
import { config } from '@appweaver/common';

export function isTypeScriptEntrypoint(): boolean {
  const mainPath = require.main?.filename || process.argv[1];
  return path.extname(mainPath) === '.ts';
}

export function resolveScanPath(overridePath?: string): string {
  if (overridePath) {
    return path.resolve(overridePath);
  }

  if (isTypeScriptEntrypoint() && config.APP_SCAN_PATH) {
    return path.resolve(config.APP_SCAN_PATH);
  }

  if (config.APP_BUILD_PATH && config.APP_SCAN_PATH) {
    return path.resolve(path.join(config.APP_BUILD_PATH, config.APP_SCAN_PATH));
  }

  return path.join(process.cwd(), './dist/src');
}

export function resolveSeedersPath(overridePath?: string): string {
  if (overridePath) {
    return path.resolve(overridePath);
  }

  if (isTypeScriptEntrypoint() && config.APP_SCAN_PATH) {
    return path.resolve(config.DATABASE_SEEDERS_DIR_PATH);
  }

  if (config.APP_BUILD_PATH && config.DATABASE_SEEDERS_DIR_PATH) {
    return path.resolve(
      path.join(config.APP_BUILD_PATH, config.DATABASE_SEEDERS_DIR_PATH)
    );
  }

  return path.join(process.cwd(), './dist/database/seeders');
}
