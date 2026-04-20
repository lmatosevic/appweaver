import { replaceTscAliasPaths } from 'tsc-alias';
import { config } from '@appweaver/common';
import { rimrafPath, runProcess } from '../utils';

/**
 * Builds the project by compiling TypeScript files and replacing alias paths.
 *
 * @param {string} projectFile - The path to the TypeScript project configuration file.
 * @return {Promise<number>} A promise that resolves to the status code of the TypeScript compilation process.
 * Returns 0 if the compilation process is successful.
 */
export async function buildProject(projectFile: string): Promise<number> {
  await rimrafPath(config.APP_BUILD_PATH, true);

  const tscStatus = await runProcess('tsc', ['-p', projectFile]);

  await replaceTscAliasPaths({ configFile: projectFile });

  return tscStatus || 0;
}
