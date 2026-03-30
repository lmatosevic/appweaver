import { config } from '@appweaver/common';
import { rimrafPath, runProcess } from '../utils';

export async function buildProject(): Promise<void> {
  await rimrafPath(config.APP_BUILD_PATH, true);
  await runProcess('tsc', ['-p tsconfig.build.json']);
  await runProcess('tsc-alias', ['-p tsconfig.build.json']);
}
