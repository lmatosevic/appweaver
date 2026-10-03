const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { packagesDir, distDir } = require('./constants');

// Regenerates the lockfile of every sample project, so its Docker image builds
// with a clean install outside the monorepo. Given a version, it first pins
// the @appweaver packages in the lockfiles to that release, taking their
// manifests and integrity from the built packages, which are the exact
// tarballs published. The registry is never asked for the new release, so it
// runs right after publishing, before the registry serves it. With `--commit`
// it then commits the changed lockfiles.
//
//   node tools/lock-samples.js
//   node tools/lock-samples.js 1.7.0 --commit

const samplesDir = 'sample';
const registryUrl = 'https://registry.npmjs.org/';
const lockedPackages = ['core', 'common', 'cli', 'client'];

const cliArgs = process.argv.slice(2);
const commit = cliArgs.includes('--commit');
const version = cliArgs.find((arg) => !arg.startsWith('--'));

if (commit && !version) {
  console.error('Missing the released version to commit the lockfiles for');
  process.exit(1);
}

const releases = version ? loadReleases(version) : undefined;

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
          '--no-audit',
          '--no-fund'
        ],
        'package-lock.json'
      ];

  const lockfilePath = path.join(sampleDir, lockfile);
  if (releases && fs.existsSync(lockfilePath)) {
    console.log(`Pinning ${sampleDir} to version ${version}...`);
    const content = fs.readFileSync(lockfilePath, 'utf8');
    fs.writeFileSync(
      lockfilePath,
      bun ? pinBunLock(content, releases) : pinPackageLock(content, releases)
    );
  }

  // Resolves the rest of the tree against the pinned packages
  console.log(`Locking ${sampleDir} with ${command}...`);
  run(command, args, sampleDir);
  lockfiles.push(path.posix.join(samplesDir, name, lockfile));
}

if (commit) {
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
      `chore(samples): lock the samples to version ${version}`
    ]);
  }
}

/**
 * Reads the manifest and the tarball integrity of every built package, which
 * must be of the given version.
 */
function loadReleases(version) {
  const releases = new Map();

  for (const pkg of lockedPackages) {
    const pkgDir = path.join(packagesDir, pkg, distDir);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')
    );

    if (manifest.version !== version) {
      console.error(
        `${manifest.name} is built at version ${manifest.version}, not ${version}`
      );
      process.exit(1);
    }

    // Packs the same tarball "npm publish" uploads, without writing it
    const result = spawn('npm', ['pack', '--dry-run', '--json'], {
      cwd: pkgDir,
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      console.error(`Packing ${manifest.name} failed:\n${result.stderr}`);
      process.exit(result.status ?? 1);
    }

    // npm 11 prints an array of the packed packages, npm 12 an object
    const packed = JSON.parse(result.stdout);
    const { integrity } = Array.isArray(packed)
      ? packed[0]
      : packed[manifest.name];

    releases.set(manifest.name, { manifest, integrity });
  }

  return releases;
}

/**
 * Rewrites the entries of the released packages in a package-lock.json,
 * keeping the flags npm derives from the dependency tree.
 */
function pinPackageLock(content, releases) {
  const lock = JSON.parse(content);

  for (const [location, entry] of Object.entries(lock.packages)) {
    const release = releases.get(location.replace(/^.*node_modules\//, ''));
    if (!release) {
      continue;
    }

    const { manifest, integrity } = release;
    lock.packages[location] = {
      version: manifest.version,
      resolved: tarballUrl(manifest),
      integrity,
      dev: entry.dev,
      optional: entry.optional,
      devOptional: entry.devOptional,
      peer: entry.peer,
      license: manifest.license,
      dependencies: manifest.dependencies,
      optionalDependencies: manifest.optionalDependencies,
      bin: normalizeBin(manifest.bin),
      engines: manifest.engines,
      peerDependencies: manifest.peerDependencies,
      peerDependenciesMeta: manifest.peerDependenciesMeta
    };
  }

  return `${JSON.stringify(lock, null, 2)}\n`;
}

/**
 * Rewrites the entries of the released packages in a bun.lock, each of which
 * is a single line in its "packages" section.
 */
function pinBunLock(content, releases) {
  return content.replace(
    /^(\s*"(?:[^"]+\/)?(@[^"/]+\/[^"/]+)": )\[.*\](,?)$/gm,
    (line, prefix, name, comma) => {
      const release = releases.get(name);
      if (!release) {
        return line;
      }

      const { manifest, integrity } = release;
      const optionalPeers = Object.keys(
        manifest.peerDependenciesMeta ?? {}
      ).filter((peer) => manifest.peerDependenciesMeta[peer].optional);
      const metadata = {
        dependencies: manifest.dependencies,
        optionalDependencies: manifest.optionalDependencies,
        peerDependencies: manifest.peerDependencies,
        optionalPeers: optionalPeers.length ? optionalPeers : undefined,
        os: manifest.os,
        cpu: manifest.cpu,
        bin: normalizeBin(manifest.bin)
      };

      const entry = [`${name}@${manifest.version}`, '', metadata, integrity];
      return `${prefix}${formatBunValue(entry)}${comma}`;
    }
  );
}

/**
 * Formats a value the way bun.lock writes its package entries.
 */
function formatBunValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(formatBunValue).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    const fields = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .map(
        ([key, field]) => `${JSON.stringify(key)}: ${formatBunValue(field)}`
      );
    return `{ ${fields.join(', ')} }`;
  }
  return JSON.stringify(value);
}

/**
 * Normalizes the bin paths of a manifest as the registry serves them.
 */
function normalizeBin(bin) {
  if (!bin) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(bin).map(([name, file]) => [
      name,
      path.posix.normalize(file)
    ])
  );
}

function tarballUrl({ name, version }) {
  return `${registryUrl}${name}/-/${name.split('/')[1]}-${version}.tgz`;
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
