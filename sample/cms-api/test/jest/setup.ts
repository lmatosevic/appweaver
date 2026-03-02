import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

export default async function setup() {
  const rootPath = path.resolve(__dirname, '..', '..');

  await fsp.rm(path.join(rootPath, 'temp'), { recursive: true, force: true });

  const generateResult = spawnSync('npm run weaver -- generate --schema', {
    cwd: rootPath,
    stdio: 'inherit',
    shell: true
  });

  if (generateResult.error) {
    console.error(generateResult.error);
    process.exit(1);
  }

  const migrateResult = spawnSync(
    'npm run weaver -- migration --name test_init',
    {
      cwd: rootPath,
      stdio: 'inherit',
      shell: true
    }
  );

  if (migrateResult.error) {
    console.error(migrateResult.error);
    process.exit(1);
  }
}
