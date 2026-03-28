import { config, Runtime } from '@appweaver/common';
import { runProcess } from '../utils';

export async function buildProject(): Promise<void> {
  await runProcess('rimraf', ['dist']);

  if (config.APP_RUNTIME === Runtime.Bun) {
    await buildBunProject();
  } else {
    await buildNodeProject();
  }
}

async function buildNodeProject(): Promise<void> {
  await runProcess('tsc', ['-p tsconfig.build.json']);
  await runProcess('tsc-alias', ['-p tsconfig.build.json']);
}

async function buildBunProject(): Promise<void> {
  await runProcess('bun', [
    'build',
    config.APP_MAIN_FILE_PATH,
    '--outdir dist',
    '--target node',
    '--tsconfig ./tsconfig.build.json'
  ]);
}
