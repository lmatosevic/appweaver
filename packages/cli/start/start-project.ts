import path from 'node:path';
import { TscWatchClient } from 'tsc-watch/client';
import { replaceTscAliasPaths } from 'tsc-alias';
import { Runtime, appConfig } from '@appweaver/common';
import { localeConfig } from '@appweaver/core/config';
import { templateConfig } from '@appweaver/core/config';
import { isBunProcess, runProcess } from '../utils';
import { watchPaths } from './watch-paths';

/** Directories read at runtime, which tsc does not watch. */
const runtimePaths = () => [templateConfig.PATH, localeConfig.PATH];

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
    appConfig.BUILD_PATH,
    appConfig.MAIN_FILE_PATH.replace(/\.ts$/i, '.js')
  );

  if (isBunProcess() && appConfig.RUNTIME === Runtime.Bun) {
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
 * Watches the specified Node.js project for changes, recompiles TypeScript files, replaces aliases in import paths,
 * and restarts the main application process upon successful compilation, or when a template or translation file
 * changes while the last compilation succeeded.
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
  let runningProcess: Promise<number> | undefined;
  let compiled = false;
  let restarting: Promise<void> = Promise.resolve();
  let cleanedUp = false;
  const watch = new TscWatchClient();

  // Serialized, so a compilation and a file change never start two processes
  const restart = (beforeStart?: () => Promise<void>) => {
    restarting = restarting.then(async () => {
      abortController?.abort();

      // Wait for the previous process to fully terminate before starting a new one
      await runningProcess;

      await beforeStart?.();
      // A compilation started or failed meanwhile
      if (!compiled || cleanedUp) {
        return;
      }

      abortController = new AbortController();
      runningProcess = runProcess('node', [mainFilePath], {
        signal: abortController.signal
      });
    });
    return restarting;
  };

  watch.on('started', () => {
    compiled = false;
  });

  // Resolve the import aliases of each successful compilation, then restart
  watch.on('success', async () => {
    compiled = true;
    await restart(() => replaceTscAliasPaths({ configFile: projectFile }));
  });

  // Handler for any compilation error to abort previously started process
  watch.on('compile_errors', () => {
    compiled = false;
    abortController?.abort();
  });

  // Restart on template and translation changes while the last build succeeded
  const fileWatcher = watchPaths(runtimePaths(), () => {
    if (compiled) {
      void restart();
    }
  });

  // Cleanup should be done only once on process termination
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    fileWatcher.abort();
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
 * Monitors file changes in the source, template and translation directories and restarts the Bun process
 * accordingly, once per burst of changes.
 *
 * @return {Promise<void>} A promise that resolves when the watching process is stopped.
 */
async function watchBunProcess(): Promise<void> {
  let abortController: AbortController | undefined;
  let runningProcess: Promise<number> | undefined;
  let restarting: Promise<void> = Promise.resolve();

  // Starts a new process and aborts the previous one, one restart at a time
  const start = () => {
    restarting = restarting.then(async () => {
      abortController?.abort();

      // Wait for the previous process to fully terminate before starting a new one
      await runningProcess;

      abortController = new AbortController();

      runningProcess = runProcess('bun', [appConfig.MAIN_FILE_PATH], {
        signal: abortController.signal
      });
    });
    return restarting;
  };

  // Initially start the application process
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });

  // Wait before starting watcher to prevent restarts during init phase
  await new Promise((r) => setTimeout(r, 200));

  // Watch for file changes and start a new process once they settle
  const fileWatcher = watchPaths(
    [appConfig.SOURCE_PATH, ...runtimePaths()],
    () => void start()
  );

  await new Promise((resolve) =>
    fileWatcher.signal.addEventListener('abort', resolve)
  );
}
