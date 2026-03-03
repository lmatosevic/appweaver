import { spawn } from 'node:child_process';
import { config } from '@appweaver/common';

/**
 * Executes a command-line process with the given command and arguments.
 *
 * @param {string} cmd - The command to execute.
 * @param {string[]} [args=[]] - An optional array of arguments to pass to the command.
 * @param {boolean} quiet - An flag indication if this process stdout and stderr should be hidden.
 * @return {Promise<number | null>} A promise that resolves with the exit code of the process or rejects
 * if an error occurs.
 */
export function runProcess(
  cmd: string,
  args: string[] = [],
  quiet: boolean = false
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const command = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
    const child = spawn(command, {
      stdio: quiet
        ? ['ignore', 'ignore', 'pipe']
        : ['inherit', 'inherit', 'inherit'],
      shell: true
    });

    child.on('error', reject);

    const stdErr: string[] = [];
    if (quiet && child.stderr) {
      child.stderr.on('data', (data) => {
        stdErr.push(data.toString('utf8'));
      });
    }

    child.on('close', (code) => {
      if (quiet && code !== 0) {
        reject(new Error(stdErr.join('\n')));
      }
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
