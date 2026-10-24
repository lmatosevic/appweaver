require('dotenv/config');

const path = require('path');
const { spawnSync } = require('child_process');
const { moduleName, packagesDir, distDir } = require('./constants');

// Publishes the built package, skipping a version the registry already has, so
// a release failing halfway publishes the remaining packages when run again.
// Written in Node rather than as a shell line, since semantic-release runs its
// commands with cmd.exe on Windows.
//
//   node tools/publish-package.js common 2.0.0

const [pkg, version] = process.argv.slice(2);

if (!pkg || !version) {
  console.error('Usage: node tools/publish-package.js <package> <version>');
  process.exit(1);
}

const name = `${moduleName}/${pkg}`;
const cwd = path.join(packagesDir, pkg, distDir);

// npm view prints nothing (or fails with E404) for a version not published
const view = npm(['view', `${name}@${version}`, 'version'], {
  cwd,
  encoding: 'utf8'
});
if (view.status === 0 && view.stdout.trim()) {
  console.log(`${name}@${version} is already published, skipping`);
  process.exit(0);
}

const publish = npm(['publish'], { cwd, stdio: 'inherit' });
process.exit(publish.status ?? 1);

/**
 * Runs npm synchronously. On Windows, npm is a script run through the shell,
 * which takes the command as a single line of arguments without spaces.
 */
function npm(args, options) {
  if (process.platform === 'win32') {
    return spawnSync(['npm', ...args].join(' '), { ...options, shell: true });
  }
  return spawnSync('npm', args, options);
}
