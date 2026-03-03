import { spawnSync } from 'node:child_process';

export default async function teardown() {
  const { error } = spawnSync('npm run weaver -- test teardown', {
    stdio: 'inherit',
    shell: true
  });

  if (error) {
    console.error(error);
    process.exit(1);
  }
}
