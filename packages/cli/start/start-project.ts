import path from 'node:path';
import { watch } from 'node:fs/promises';
import { config, Runtime } from '@appweaver/common';
import { isBunProcess, runProcess } from '../utils';

export async function startProject(watch: boolean) {
  const mainFilePath = path.join(
    config.APP_BUILD_PATH,
    config.APP_MAIN_FILE_PATH.replace(/\.ts$/i, '.js')
  );

  if (isBunProcess() && config.APP_RUNTIME === Runtime.Bun) {
    await startBunProject(mainFilePath, watch);
  } else {
    await startNodeProject(mainFilePath, watch);
  }
}

async function startNodeProject(
  mainPath: string,
  watch: boolean
): Promise<void> {
  if (watch) {
    await runProcess('tsc-watch', [
      '-p tsconfig.build.json',
      '--onCompilationComplete "tsc-alias -p tsconfig.build.json"',
      `--onSuccess "node ${mainPath}"`
    ]);
  } else {
    await runProcess('node', [mainPath]);
  }
}

async function startBunProject(
  mainPath: string,
  watch: boolean
): Promise<void> {
  if (watch) {
    await runProcess('bun', [mainPath]);
  } else {
    await watchBunProcess();
  }
}

/**
 * Monitors file changes in the specified directory and restarts the Bun process accordingly.
 * The function uses a debounced mechanism to prevent restarting the process too frequently.
 * Debounce threshold is 200 milliseconds.
 *
 * @return A promise that resolves when the watching process is stopped or completed.
 */
async function watchBunProcess(): Promise<void> {
  let proc: Bun.Subprocess | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function start() {
    proc?.kill();
    proc = Bun.spawn(['bun', config.APP_MAIN_FILE_PATH], {
      stdout: 'inherit',
      stderr: 'inherit'
    });
  }

  start();

  for await (const _ of watch(config.APP_SCAN_PATH, { recursive: true })) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(start, 200);
  }
}
