import path from 'node:path';
import { watch } from 'node:fs/promises';
import { TscWatchClient } from 'tsc-watch/client';
import { replaceTscAliasPaths } from 'tsc-alias';
import { config, Runtime } from '@appweaver/common';
import { isBunProcess, runProcess } from '../utils';

/**
 * Starts the project using the specified project file and runtime options.
 *
 * @param {string} projectFile - The path to the project file that should be used.
 * @param {boolean} watch - A flag indicating whether to enable watch mode for automatic restarts on file changes.
 * @return {Promise<void>} A promise that resolves when the project has started.
 */
export async function startProject(
  projectFile: string,
  watch: boolean
): Promise<void> {
  const mainFilePath = path.join(
    config.APP_BUILD_PATH,
    config.APP_MAIN_FILE_PATH.replace(/\.ts$/i, '.js')
  );

  if (isBunProcess() && config.APP_RUNTIME === Runtime.Bun) {
    await startBunProject(mainFilePath, watch);
  } else {
    await startNodeProject(mainFilePath, projectFile, watch);
  }
}

/**
 * Starts a Node.js project by executing the specified main file.
 * Optionally enables watch mode to monitor file changes.
 *
 * @param {string} mainFilePath - The path to the main file to be executed.
 * @param {string} projectFile - The project configuration file used during execution.
 * @param {boolean} watch - Whether to enable watch mode for file changes.
 * @return {Promise<void>} A promise that resolves when the operation completes.
 */
async function startNodeProject(
  mainFilePath: string,
  projectFile: string,
  watch: boolean
): Promise<void> {
  if (watch) {
    await watchNodeProject(mainFilePath, projectFile);
  } else {
    await runProcess('node', [mainFilePath]);
  }
}

/**
 * Starts a Bun project by running the specified main file. Optionally enables a watch mode.
 *
 * @param {string} mainFilePath - The path to the main file to run with Bun.
 * @param {boolean} watch - Determines whether the Bun process should execute in watch mode.
 * @return {Promise<void>} A promise that resolves when the Bun process starts or when the watch mode is initiated.
 */
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
 * Watches the specified Node.js project for changes, recompiles TypeScript files, replaces aliases in import patsh,
 * and restarts the main application process upon successful compilation.
 *
 * @param {string} mainFilePath - The entry point of the application that will be executed after each successful
 * compilation.
 * @param {string} projectFile - The TypeScript config file path (tsconfig.json).
 * @return {Promise<void>} A promise that resolves when the watching process is stopped.
 */
async function watchNodeProject(
  mainFilePath: string,
  projectFile: string
): Promise<void> {
  let abortController: AbortController | undefined;
  const watch = new TscWatchClient();

  // Handler for every successful compilation of watched code, aborts previous
  // process and starts a new one
  watch.on('success', async () => {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    // Replace import alias paths in compiled code
    await replaceTscAliasPaths({ configFile: projectFile });

    // Start the main application process
    await runProcess('node', [mainFilePath], {
      signal: abortController.signal
    });
  });

  // Handler for any compilation error to abort previously started process
  watch.on('compile_errors', () => {
    abortController?.abort();
  });

  // Cleanup should be done only once on process termination
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    abortController?.abort();
    watch.kill();
  };

  // When process is terminated in any way, all processes should be aborted
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  watch.start('-p', projectFile);
}

/**
 * Monitors file changes in the specified directory and restarts the Bun process accordingly.
 * The function uses a debounced mechanism to prevent restarting the process too frequently.
 * Debounce threshold is 200 milliseconds.
 *
 * @return {Promise<void>} A promise that resolves when the watching process is stopped.
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
