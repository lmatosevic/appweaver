const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Runs an operation in every sample project it applies to, or only in the
// samples named after its parameters, stopping at the first failure.
//
//   node tools/manage-samples.js regenerate:db
//   node tools/manage-samples.js regenerate:db cms-api hr-api
//   node tools/manage-samples.js run generate
//   node tools/manage-samples.js run seed webshop-api

const samplesDir = 'sample';

const operations = {
  'regenerate:db': {
    params: [],
    description:
      'Recreates the database with a single init migration from the current schema.',
    command: () =>
      'rimraf database/migrations && weaver migration reset -y && weaver migration new init',
    appliesTo: (sampleDir) =>
      fs.existsSync(path.join(sampleDir, 'prisma.config.ts'))
  },
  run: {
    params: ['script'],
    description:
      'Runs a package.json script of every sample having it, with Bun in a Bun sample.',
    command: (sampleDir, [script]) => `${runner(sampleDir)} run ${script}`,
    appliesTo: (sampleDir, [script]) => Boolean(readScripts(sampleDir)[script])
  }
};

const [operationName, ...cliArgs] = process.argv.slice(2);
const operation = operations[operationName];
if (!operation) {
  if (operationName) {
    console.error(`Unknown operation: ${operationName}\n`);
  }
  printUsage();
  process.exit(operationName ? 1 : 0);
}

const params = cliArgs.slice(0, operation.params.length);
const sampleNames = cliArgs.slice(operation.params.length);
if (params.length < operation.params.length) {
  const missing = operation.params.slice(params.length);
  console.error(`Missing ${missing.map((p) => `<${p}>`).join(' ')}\n`);
  printUsage();
  process.exit(1);
}

const allSamples = fs
  .readdirSync(samplesDir)
  .filter((name) => fs.existsSync(path.join(samplesDir, name, 'package.json')));
const unknownSamples = sampleNames.filter((name) => !allSamples.includes(name));
if (unknownSamples.length) {
  console.error(`Unknown samples: ${unknownSamples.join(', ')}`);
  process.exit(1);
}

const title = [operationName, ...params].join(' ');
const samples = (sampleNames.length ? sampleNames : allSamples).filter(
  (name) => {
    const applies = operation.appliesTo(path.join(samplesDir, name), params);
    if (!applies) {
      console.log(`Skipping ${name}, ${title} does not apply to it`);
    }
    return applies;
  }
);

for (const name of samples) {
  const sampleDir = path.join(samplesDir, name);
  const command = operation.command(sampleDir, params);
  console.log(`\n> ${name}: ${command}`);
  const result = spawnSync(command, {
    cwd: sampleDir,
    env: withBinPath(sampleDir),
    shell: true,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    console.error(`\n${title} failed in ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log(
  samples.length
    ? `\n${title} done in ${samples.join(', ')}`
    : `\n${title} applies to none of the samples`
);

function printUsage() {
  console.log(
    'Usage: node tools/manage-samples.js <operation> [params...] [samples...]\n'
  );
  console.log('Operations:');
  for (const [name, { params, description }] of Object.entries(operations)) {
    const usage = [name, ...params.map((p) => `<${p}>`)].join(' ');
    console.log(`  ${usage.padEnd(18)}${description}`);
  }
}

function readScripts(sampleDir) {
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(sampleDir, 'package.json'), 'utf8')
  );
  return pkgJson.scripts ?? {};
}

// A Bun sample is configured by its bunfig.toml and runs its scripts with Bun
function runner(sampleDir) {
  return fs.existsSync(path.join(sampleDir, 'bunfig.toml')) ? 'bun' : 'npm';
}

// Puts the binaries of the sample and of the root on the PATH, like `npm run`
function withBinPath(sampleDir) {
  const env = { ...process.env };
  const key =
    Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const binDirs = [sampleDir, '.'].map((dir) =>
    path.resolve(dir, 'node_modules', '.bin')
  );
  env[key] = [...binDirs, env[key]].filter(Boolean).join(path.delimiter);
  return env;
}
