import { spawn } from 'node:child_process';
import { config } from '@appweaver/common';

/**
 * Executes a shell command with optional arguments and configuration parameters.
 *
 * @param {string} cmd - The command to execute.
 * @param {string[]} [args=[]] - An array of arguments to pass to the command.
 * @param {Object} [params={ quiet: false }] - Configurations for how the process should run.
 * @param {boolean} [params.quiet=false] - If true, suppresses the process output.
 * @return {Promise<number | null>} A promise that resolves with the exit code of the process or null on error.
 */
export function runProcess(
  cmd: string,
  args: string[] = [],
  params: { quiet?: boolean } = { quiet: false }
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const command = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
    const child = spawn(command, {
      stdio: params.quiet ? 'ignore' : 'inherit',
      shell: true,
      env: { ...process.env, WEAVER_CLI: undefined }
    });

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
