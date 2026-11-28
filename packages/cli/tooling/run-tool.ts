import { spawn } from 'node:child_process';
import type * as ToolingPackage from '@appweaver/tooling';
import { importPackage } from '../utils/package-util';

/**
 * Runs a tool of the project's `@appweaver/tooling` (`eslint`, `prettier` or `jest`) with `node`, in the project
 * directory, its output inherited. Exits with a message naming the package when the project does not have it.
 *
 * @param {ToolingPackage.Tool} tool - The tool.
 * @param {string[]} args - Its arguments.
 * @param {string} command - The `weaver` command running it, named by the message of a missing package.
 * @param {NodeJS.ProcessEnv} [env] - Variables set for the tool, besides the environment of the process.
 * @return {Promise<number>} The exit code of the tool.
 */
export async function runTool(
  tool: ToolingPackage.Tool,
  args: string[],
  command: string,
  env: NodeJS.ProcessEnv = {}
): Promise<number> {
  const { toolBin } = await importPackage<typeof ToolingPackage>(
    '@appweaver/tooling',
    command
  );
  return runScript(process.execPath, [toolBin(tool), ...args], env);
}

/**
 * Runs an executable with the output inherited, in the working directory.
 *
 * @param {string} executable - The executable, i.e. `process.execPath` or `bun`.
 * @param {string[]} args - Its arguments.
 * @param {NodeJS.ProcessEnv} [env] - Variables set besides the environment of the process.
 * @return {Promise<number>} Its exit code, `1` when a signal ended it.
 */
export function runScript(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, ...env }
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}
