import { replaceTscAliasPaths } from 'tsc-alias';
import { config } from '@appweaver/common';
import { rimrafPath, runProcess } from '../utils';

export async function buildProject(projectFile: string): Promise<number> {
  await rimrafPath(config.APP_BUILD_PATH, true);

  const tscStatus = await runProcess('tsc', ['-p', projectFile]);

  await replaceTscAliasPaths({ configFile: projectFile });

  return tscStatus || 0;
}
