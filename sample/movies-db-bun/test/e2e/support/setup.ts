import { spawnSync } from 'node:child_process';

export default async function setup() {
  const { error } = spawnSync('weaver test setup', {
    stdio: 'inherit',
    shell: true
  });

  if (error) {
    console.error(error);
    process.exit(1);
  }
}
