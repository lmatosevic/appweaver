const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { packagesDir, distDir } = require('./constants');

// Regenerates the lockfile of every sample project, so its Docker image builds
// with a clean install outside the monorepo. Given a version, it first raises
// the @appweaver ranges of the samples to it and pins the packages in the
// lockfiles to that release, taking their manifests and integrity from the
// built packages, which are the exact tarballs published. The registry is
// never asked for the new release, so it runs right after publishing, before
// the registry serves it. With `--commit` it then commits the changed
// manifests and lockfiles.
//
//   node tools/lock-samples.js
//   node tools/lock-samples.js 1.7.0 --commit

const samplesDir = 'sample';
const registryUrl = 'https://registry.npmjs.org/';
const lockedPackages = [
  'core',
  'common',
  'data',
  'web',
  'redis',
  'bullmq',
  'cron',
  'nodemailer',
  'handlebars',
  'sharp',
  'testing',
  'cli',
  'client',
  'create'
];

const cliArgs = process.argv.slice(2);
const commit = cliArgs.includes('--commit');
const version = cliArgs.find((arg) => !arg.startsWith('--'));

if (commit && !version) {
  console.error('Missing the released version to commit the lockfiles for');
  process.exit(1);
}

const releases = version ? loadReleases(version) : undefined;

const changedFiles = [];
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
  if (releases) {
    console.log(`Pinning ${sampleDir} to version ${version}...`);
    const pkgJsonPath = path.join(sampleDir, 'package.json');
    const pkgJson = raiseRanges(
      fs.readFileSync(pkgJsonPath, 'utf8'),
      releases,
      version
    );
    fs.writeFileSync(pkgJsonPath, pkgJson);
    const needed = neededReleases(JSON.parse(pkgJson), releases);

    if (fs.existsSync(lockfilePath)) {
      const content = fs.readFileSync(lockfilePath, 'utf8');
      fs.writeFileSync(
        lockfilePath,
        bun
          ? pinBunLock(content, releases, needed, JSON.parse(pkgJson))
          : pinPackageLock(content, releases, needed)
      );
    }
  }

  // Resolves the rest of the tree against the pinned packages
  console.log(`Locking ${sampleDir} with ${command}...`);
  run(command, args, sampleDir);
  changedFiles.push(
    path.posix.join(samplesDir, name, 'package.json'),
    path.posix.join(samplesDir, name, lockfile)
  );
}

if (commit) {
  run('git', ['add', ...changedFiles]);

  const staged = spawn('git', ['diff', '--cached', '--quiet'], {
    stdio: 'inherit'
  });
  if (staged.status === 0) {
    console.log('The samples are up to date');
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
 * Raises the ranges of the released packages in a sample package.json to the
 * given version, keeping the rest of the file as it is.
 */
function raiseRanges(content, releases, version) {
  return content.replace(
    /("(@[^"/]+\/[^"/]+)":\s*")[^"]*"/g,
    (field, key, name) => (releases.has(name) ? `${key}^${version}"` : field)
  );
}

/**
 * Lists the released packages a sample needs, with the released packages they
 * depend on, each flagged as a dev dependency when only the dev dependencies
 * of the sample need it.
 */
function neededReleases(pkgJson, releases) {
  const needed = new Map();
  const pending = [
    ...Object.keys(pkgJson.dependencies ?? {}).map((name) => [name, false]),
    ...Object.keys(pkgJson.devDependencies ?? {}).map((name) => [name, true])
  ];

  while (pending.length > 0) {
    const [name, dev] = pending.shift();
    const release = releases.get(name);
    if (!release || (needed.has(name) && (dev || !needed.get(name)))) {
      continue;
    }
    needed.set(name, dev);
    for (const dependency of Object.keys(
      release.manifest.dependencies ?? {}
    )) {
      pending.push([dependency, dev]);
    }
  }

  return needed;
}

/**
 * Rewrites the entries of the released packages in a package-lock.json,
 * keeping the flags npm derives from the dependency tree. A released package
 * the sample needs but the lockfile lacks, i.e. one published for the first
 * time, gets its entry too, since the registry may not serve it yet.
 */
function pinPackageLock(content, releases, needed) {
  const lock = JSON.parse(content);

  const pin = (location, entry, { manifest, integrity }) => {
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
  };

  for (const [location, entry] of Object.entries(lock.packages)) {
    const release = releases.get(location.replace(/^.*node_modules\//, ''));
    if (release) {
      pin(location, entry, release);
    }
  }

  for (const [name, dev] of needed) {
    if (!lock.packages[`node_modules/${name}`]) {
      pin(`node_modules/${name}`, { dev: dev || undefined }, releases.get(name));
    }
  }

  return `${JSON.stringify(lock, null, 2)}\n`;
}

/**
 * Rewrites the entries of the released packages in a bun.lock, each of which
 * is a single line in its "packages" section. A released package the sample
 * needs but the lockfile lacks gets its line at the start of the section.
 */
function pinBunLock(content, releases, needed, pkgJson) {
  const entry = (name) => {
    const { manifest, integrity } = releases.get(name);
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

    return formatBunValue([
      `${name}@${manifest.version}`,
      '',
      metadata,
      integrity
    ]);
  };

  const pinned = content.replace(
    /^(\s*)"((?:[^"]+\/)?(@[^"/]+\/[^"/]+))": \[.*\](,?)$/gm,
    (line, indent, key, name, comma) =>
      releases.has(name) ? `${indent}"${key}": ${entry(name)}${comma}` : line
  );

  const missing = [...needed.keys()].filter(
    (name) => !pinned.includes(`"${name}": [`)
  );
  return withWorkspaceReleases(pinned, releases, pkgJson).replace(
    /^(\s*)"packages": \{\n/m,
    (section, indent) =>
      section +
      missing.map((name) => `${indent}  "${name}": ${entry(name)},\n`).join('')
  );
}

/**
 * Writes the ranges of the released packages of the sample package.json into
 * the root workspace of a bun.lock, which bun otherwise resolves again from
 * the registry.
 */
function withWorkspaceReleases(content, releases, pkgJson) {
  const start = content.indexOf('"workspaces": {');
  const end = content.indexOf('"packages": {');
  let workspaces = content.slice(start, end);

  for (const field of ['dependencies', 'devDependencies']) {
    const ranges = Object.entries(pkgJson[field] ?? {}).filter(([name]) =>
      releases.has(name)
    );
    workspaces = workspaces.replace(
      new RegExp(`^(\\s*)"${field}": \\{\\n([\\s\\S]*?)^\\1\\},`, 'm'),
      (block, indent, body) => {
        const lines = body
          .split('\n')
          .filter((line) => line.trim() !== '')
          .filter((line) => !ranges.some(([name]) => line.includes(`"${name}":`)));
        lines.push(
          ...ranges.map(
            ([name, range]) => `${indent}  ${JSON.stringify(name)}: ${JSON.stringify(range)},`
          )
        );
        lines.sort((a, b) => a.trim().localeCompare(b.trim()));
        return `${indent}"${field}": {\n${lines.join('\n')}\n${indent}},`;
      }
    );
  }

  return content.slice(0, start) + workspaces + content.slice(end);
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
