import { config, Runtime } from '@appweaver/common';
import { runProcess } from '../utils';

export async function buildProject(): Promise<void> {
  await runProcess('rimraf', [config.APP_BUILD_PATH]);

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
  await Bun.build({
    entrypoints: [...new Bun.Glob('./{src,database}/**/*.ts').scanSync()],
    outdir: config.APP_BUILD_PATH,
    target: 'bun',
    splitting: true,
    format: 'cjs'
  });
}
