import path from 'node:path';
import { config, Runtime } from '@appweaver/common';
import { runProcess } from '../utils';

export async function startProject(watch: boolean) {
  if (config.APP_RUNTIME === Runtime.Bun) {
    await startBunProject(watch);
  } else {
    await startNodeProject(watch);
  }
}

async function startNodeProject(watch: boolean) {
  const mainFilePath = path.join(
    config.APP_BUILD_PATH,
    config.APP_MAIN_FILE_PATH.replace(/\.ts$/i, '.js')
  );
  if (watch) {
    await runProcess('tsc-watch', [
      '-p tsconfig.build.json',
      '--onCompilationComplete "tsc-alias -p tsconfig.build.json"',
      `--onSuccess "node ${mainFilePath}"`
    ]);
  } else {
    await runProcess('node', [mainFilePath]);
  }
}

async function startBunProject(watch: boolean) {
  if (watch) {
    await runProcess('bun', [config.APP_MAIN_FILE_PATH]);
  } else {
    await runProcess('bun', ['--watch', config.APP_MAIN_FILE_PATH]);
  }
}
