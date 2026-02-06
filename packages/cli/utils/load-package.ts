import path from 'node:path';
import fs from 'node:fs';

export function loadPackage(): Record<string, string> {
  let pkgPath = path.join(__dirname, '../../package.json');
  if (!fs.existsSync(pkgPath)) {
    pkgPath = path.join(__dirname, '../package.json');
  }

  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}
