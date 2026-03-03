import path from 'node:path';
import { spawnSync } from 'node:child_process';

afterEach(() => {
  const { error } = spawnSync('npm run weaver -- test reset', {
    cwd: path.resolve(__dirname, '..', '..'),
    stdio: 'inherit',
    shell: true
  });

  if (error) {
    console.error(error);
    process.exit(1);
  }
});
