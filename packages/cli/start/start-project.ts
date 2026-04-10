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
  mainFilePath: string,
  watch: boolean
): Promise<void> {
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

async function startBunProject(
  mainFilePath: string,
  watch: boolean
): Promise<void> {
  if (watch) {
    await watchBunProcess();
  } else {
    await runProcess('bun', [mainFilePath]);
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
  let abortController: AbortController | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Starts a new process and aborts the previous one
  async function start() {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    await runProcess('bun', [config.APP_MAIN_FILE_PATH], {
      signal: abortController.signal
    });
  }

  // Initially start the application process
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });

  // Wait before starting watcher to prevent restarts during init phase
  await new Promise((r) => setTimeout(r, 200));

  // Watch for file changes and start new process using debounce timer
  for await (const info of watch(config.APP_SOURCE_PATH, { recursive: true })) {
    if (info.filename === null) {
      // Skip non-file change events
      continue;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      await start();
    }, 100);
  }
}
