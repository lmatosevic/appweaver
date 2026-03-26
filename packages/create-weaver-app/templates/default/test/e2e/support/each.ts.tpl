import { spawnSync } from 'node:child_process';

afterEach(() => {
  const { error } = spawnSync('weaver test reset', {
    stdio: 'inherit',
    shell: true
  });

  if (error) {
    console.error(error);
    process.exit(1);
  }
});
