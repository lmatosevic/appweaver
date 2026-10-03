const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { moduleName } = require('./constants');

// Regenerates the lockfile of every sample project, pinning the published
// packages the sample would install outside the monorepo, so its Docker image
// builds with a clean install. With `--commit <version>` it first waits until
// that version is on the registry, then commits the changed lockfiles.
//
//   node tools/lock-samples.js
//   node tools/lock-samples.js --commit 1.7.0

const samplesDir = 'sample';
const registryTimeoutMs = 5 * 60 * 1000;
const registryPollMs = 10 * 1000;

const commitIndex = process.argv.indexOf('--commit');
const commitVersion =
  commitIndex > -1 ? process.argv[commitIndex + 1] : undefined;

if (commitIndex > -1 && !commitVersion) {
  console.error('Missing the released version after --commit');
  process.exit(1);
}

if (commitVersion) {
  waitForRegistry(commitVersion);
}

const lockfiles = [];
for (const name of fs.readdirSync(samplesDir)) {
  const sampleDir = path.join(samplesDir, name);
  if (!fs.existsSync(path.join(sampleDir, 'package.json'))) {
    continue;
  }

  // A Bun sample is configured by its bunfig.toml and locked with bun.lock
  const bun = fs.existsSync(path.join(sampleDir, 'bunfig.toml'));
  const [command, args, lockfile] = bun
    ? ['bun', ['install', '--lockfile-only'], 'bun.lock']
    : [
        'npm',
        [
          'install',
          '--package-lock-only',
          '--ignore-scripts',
          '--prefer-online',
          '--no-audit',
          '--no-fund'
        ],
        'package-lock.json'
      ];

  console.log(`Locking ${sampleDir} with ${command}...`);
  run(command, args, sampleDir);
  lockfiles.push(path.posix.join(samplesDir, name, lockfile));
}

if (commitVersion) {
  run('git', ['add', ...lockfiles]);

  const staged = spawn('git', ['diff', '--cached', '--quiet'], {
    stdio: 'inherit'
  });
  if (staged.status === 0) {
    console.log('The sample lockfiles are up to date');
  } else {
    run('git', [
      'commit',
      '-m',
      `chore(samples): lock the samples to version ${commitVersion}`
    ]);
  }
}

/**
 * Runs a command, exiting the process with its status when it fails.
 */
function run(command, args, cwd) {
  const result = spawn(command, args, { cwd, stdio: 'inherit' });

  if (result.status !== 0) {
    console.error(`"${command} ${args.join(' ')}" failed`);
    process.exit(result.status ?? 1);
  }
}

/**
 * Waits until the registry serves the given version of every published
 * package, since a version is not visible right after its publication.
 */
function waitForRegistry(version) {
  const packages = ['core', 'common', 'cli', 'client'].map(
    (pkg) => `${moduleName}/${pkg}@${version}`
  );
  const deadline = Date.now() + registryTimeoutMs;

  for (;;) {
    const missing = packages.filter((pkg) => {
      const result = spawn('npm', ['view', pkg, 'version'], {
        encoding: 'utf8'
      });
      return result.status !== 0 || result.stdout.trim() !== version;
    });

    if (missing.length === 0) {
      return;
    }

    if (Date.now() > deadline) {
      console.error(`Not on the registry yet: ${missing.join(', ')}`);
      process.exit(1);
    }

    console.log(`Waiting for ${missing.join(', ')} on the registry...`);
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0,
      0,
      registryPollMs
    );
  }
}

/**
 * Spawns a command synchronously. On Windows, npm and bun may be scripts run
 * through the shell, which takes the command as a single line of arguments
 * without spaces.
 */
function spawn(command, args, options) {
  if (process.platform === 'win32' && ['npm', 'bun'].includes(command)) {
    return spawnSync([command, ...args].join(' '), { ...options, shell: true });
  }
  return spawnSync(command, args, options);
}
