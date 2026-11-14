const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Lints the packages and every sample in an ESLint process of its own.
// typescript-eslint keeps the TypeScript program of every project it opens
// until the process ends, so one run over the packages and the samples needs
// the memory of all their programs at once (over 3 GB of heap, above the
// default limit of Node on many machines), and a run per project only the
// memory of the largest one.
//
//   node tools/lint.js                        the packages and every sample
//   node tools/lint.js --fix                  with any option of ESLint
//   node tools/lint.js packages/web/**/*.ts   only the given files, in one run

const packagesDir = 'packages';
const samplesDir = 'sample';

// The heap limit of every run, since the default of Node depends on the
// memory of the machine and the program of the packages nearly fills the
// smaller one (2 GB)
const heapSizeMb = 4096;

const eslintPath = path.join(
  path.dirname(require.resolve('eslint/package.json')),
  'bin',
  'eslint.js'
);

const args = process.argv.slice(2);
const files = args.filter(isFilePattern);
const options = args.filter((arg) => !files.includes(arg));

// The given files are linted in a single run, like ESLint itself would
const runs = files.length > 0 ? [files] : projectPatterns().map((p) => [p]);

let exitCode = 0;
for (const patterns of runs) {
  const { status, error } = spawnSync(
    process.execPath,
    [`--max-old-space-size=${heapSizeMb}`, eslintPath, ...options, ...patterns],
    { stdio: 'inherit' }
  );
  if (error) {
    throw error;
  }
  // Interrupted, i.e. with Ctrl+C
  if (status === null) {
    process.exit(1);
  }
  // Every project is linted, so all the problems are reported at once
  exitCode = Math.max(exitCode, status);
}
process.exit(exitCode);

/** The pattern of the packages, sharing one program, then the one of each sample, a project of its own. */
function projectPatterns() {
  const samples = fs
    .readdirSync(samplesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(path.join(samplesDir, entry.name, 'tsconfig.json'))
    )
    .map((entry) => `${samplesDir}/${entry.name}/**/*.ts`);
  return [`${packagesDir}/**/*.ts`, ...samples];
}

/** Tells a file, a directory or a glob apart from an option of ESLint and its value. */
function isFilePattern(arg) {
  return !arg.startsWith('-') && (/[*?{]/.test(arg) || fs.existsSync(arg));
}
