import { spawnSync } from 'node:child_process';

export default async function teardown() {
  const { error, status } = spawnSync('weaver test teardown', {
    stdio: 'inherit',
    shell: true
  });

  if (error || status !== 0) {
    throw (
      error ??
      new Error(`"weaver test teardown" failed with exit status ${status}`)
    );
  }
}
