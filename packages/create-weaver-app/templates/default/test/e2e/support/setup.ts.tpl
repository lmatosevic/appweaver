import { spawnSync } from 'node:child_process';

export default async function setup() {
  const { error, status } = spawnSync('weaver test setup', {
    stdio: 'inherit',
    shell: true
  });

  // A command that ran but failed sets a non-zero status, not the error
  if (error || status !== 0) {
    throw (
      error ??
      new Error(`"weaver test setup" failed with exit status ${status}`)
    );
  }
}
