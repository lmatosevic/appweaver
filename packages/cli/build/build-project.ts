import { runProcess } from '../utils';

export async function buildProject(): Promise<void> {
  await runProcess('tsc', ['-p tsconfig.build.json']);
  await runProcess('tsc-alias', ['-p tsconfig.build.json']);
}
