import { spawn } from 'node:child_process';
import treeKill from 'tree-kill';
import { config } from '@appweaver/common';

/**
 * Executes a shell command with optional arguments and configuration parameters.
 *
 * @param {string} cmd - The command to execute.
 * @param {string[]} [args=[]] - An array of arguments to pass to the command.
 * @param {Object} [params={ quiet: false }] - Configurations for how the process should run.
 * @param {boolean} [params.quiet=false] - If true, suppresses the process output.
 * @param {AbortSignal} [params.signal] - Optional AbortSignal to terminate the running process.
 * @return {Promise<number | null>} A promise that resolves with the exit code of the process or null on error.
 */
export function runProcess(
  cmd: string,
  args: string[] = [],
  params: { quiet?: boolean; signal?: AbortSignal } = {}
): Promise<number | null> {
  const { quiet = false, signal } = params;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return resolve(0);
    }

    const command = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
    const child = spawn(command, {
      stdio: quiet ? 'ignore' : 'inherit',
      shell: true,
      env: { ...process.env, WEAVER_CLI: undefined }
    });

    if (signal) {
      const abortHandler = () => {
        if (child.pid) {
          treeKill(child.pid, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(0);
            }
          });
        }
      };

      signal.addEventListener('abort', abortHandler, { once: true });
    }

    child.on('error', reject);

    child.on('close', (code) => {
      resolve(code);
    });
  });
}

/**
 * Verifies that the application's runtime environment matches the specified environment.
 * Terminates the process with an error message if the environments do not match.
 *
 * @param {string} env - The expected environment (e.g., 'production', 'development').
 * @param {string} message - The error message to display if the environment does not match.
 */
export function assertEnv(env: string, message: string): void {
  if (config.APP_ENV !== env) {
    console.error(message);
    process.exit(1);
  }
}

/**
 * Verifies that the application's runtime environment matches one of the specified environments.
 * Terminates the process with an error message if the environment does not match any of the provided options.
 *
 * @param {string[]} envs - An array of expected environments (e.g., ['prod', 'dev', 'test']).
 * @param {string} message - The error message to display if the environment does not match any of the provided options.
 */
export function assertEnvs(envs: string[], message: string): void {
  if (!envs.includes(config.APP_ENV)) {
    console.error(message);
    process.exit(1);
  }
}

/**
 * Checks if the current environment is a Bun.js process.
 *
 * This method determines whether the global `Bun` object is defined,
 * which indicates the code is running in a Bun.js runtime environment.
 *
 * @return {boolean} Returns `true` if the `Bun` object is defined, otherwise `false`.
 */
export function isBunProcess(): boolean {
  return typeof Bun !== 'undefined';
}
