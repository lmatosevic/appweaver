import path from 'node:path';
import { spawnSync } from 'node:child_process';

export default async function teardown() {
  const { error } = spawnSync('npm run weaver -- test teardown', {
    cwd: path.resolve(__dirname, '..', '..'),
    stdio: 'inherit',
    shell: true
  });

  if (error) {
    console.error(error);
    process.exit(1);
  }
}
