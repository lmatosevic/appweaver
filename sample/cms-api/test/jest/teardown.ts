import path from 'node:path';
import fsp from 'node:fs/promises';

export default async function teardown() {
  const rootPath = path.resolve(__dirname, '..', '..');

  await fsp.rm(path.join(rootPath, 'temp'), { recursive: true, force: true });
}
