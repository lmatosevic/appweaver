import { config } from '@appweaver/common';
import { rimrafPath, runProcess } from '../utils';

export async function buildProject(): Promise<number> {
  await rimrafPath(config.APP_BUILD_PATH, true);

  const tscStatus = await runProcess('tsc', ['-p tsconfig.build.json']);
  const tscAliasStatus = await runProcess('tsc-alias', [
    '-p tsconfig.build.json'
  ]);

  return tscStatus || tscAliasStatus || 0;
}
