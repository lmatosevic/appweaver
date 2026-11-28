#!/usr/bin/env node
// The load tests of the samples (V3-PERF-01 of PLAN-v3.md): seeds the main model of a sample to a size, starts the
// built application, runs the scenarios of its definition (tools/load/samples/<sample>.js) with autocannon, and writes
// a JSON report. See tools/load/README.md.
//
//   npm run load -- cms-api
//   npm run load -- cms-api --size 100k --connections 1,20
//   npm run load -- webshop-api --setup --scenarios find,query
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const { Command } = require('commander');
const { rootDir, sampleNames, loadSample, parseSize, sizeLabel } = require('./lib/samples');
const { startApp } = require('./lib/app-process');
const { adminEmail, adminPassword, authenticate, createApi, runScenario } = require('./lib/runner');
const { createRandom } = require('./lib/seed-helpers');
const { formatTable } = require('./lib/report');

const program = new Command('load')
  .description('Runs the load scenarios of the samples and writes a JSON report of each.')
  .argument('[samples...]', `The samples to load, of: ${sampleNames().join(', ')}.`)
  .option('--all', 'Load every sample with a load definition.')
  .option('--scenarios <names>', 'The scenarios to run, comma separated (default: every one).')
  .option('--size <rows>', 'The rows of the main model, i.e. 10k, 100k or 1m.', '10k')
  .option('--connections <list>', 'The connections of each run, comma separated, i.e. 1,20.', '20')
  .option('--duration <seconds>', 'The duration of each run, in seconds.', '10')
  .option('--timeout <seconds>', 'The timeout of a request, in seconds.', '10')
  .option('--output-dir <dir>', 'The directory of the JSON reports.', path.join('reports', 'load'))
  .option('--build', 'Build the sample first (Node samples).')
  .option('--setup', 'Apply the migrations and run the seeders of the sample first.')
  .option('--teardown', 'Stop the Docker Compose services of the sample once loaded.')
  .option('--no-seed', 'Skip the seeding of the main model.')
  .option('--no-start', 'Load an application already running instead of starting it.')
  .option('--verbose', 'Print the output of the application and of the commands.')
  .action(main);

program.parseAsync().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main(names, options) {
  const samples = options.all ? sampleNames() : names;
  if (samples.length === 0) {
    program.help();
  }
  const reports = [];
  for (const name of samples) {
    reports.push(await loadTest(loadSample(name), options));
  }
  for (const report of reports) {
    console.log(`\n${report.sample} (${report.database}, ${sizeLabel(report.size)} rows)\n`);
    console.log(formatTable(report));
  }
}

async function loadTest(sample, options) {
  const size = parseSize(options.size);
  const env = { SYSTEM_ADMIN_INITIAL_PASSWORD: adminPassword, SYSTEM_ADMIN_INITIAL_EMAIL: adminEmail };

  if (options.build) {
    weaver(sample, ['build'], env, options);
  }
  if (options.setup) {
    setupProject(sample, options);
    weaver(sample, ['migrate'], env, options);
    weaver(sample, ['seed'], env, options);
  }
  if (options.seed && sample.seed) {
    weaver(sample, ['run', path.join(__dirname, 'seed-task.js'), sample.name, String(size)], env, options);
  }

  const app = options.start
    ? await startApp(sample, { env, verbose: options.verbose })
    : { baseUrl: `http://localhost:${sample.port}`, stop: async () => {} };
  try {
    const headers = await authenticate(sample, app.baseUrl);
    const api = createApi(app.baseUrl, headers);
    const context = {
      size,
      random: createRandom(Date.now() & 0xffff),
      ...(sample.prepare ? await sample.prepare(api) : {})
    };
    const selected = options.scenarios?.split(',').map((s) => s.trim());
    const scenarios = sample.scenarios.filter((s) => !selected || selected.includes(s.name));
    const unknown = (selected ?? []).filter((s) => !sample.scenarios.some((scenario) => scenario.name === s));
    if (unknown.length) {
      throw new Error(`Unknown scenarios of ${sample.name}: ${unknown.join(', ')}`);
    }

    const results = [];
    for (const connections of options.connections.split(',').map(Number)) {
      for (const scenario of scenarios) {
        process.stdout.write(`${sample.name}: ${scenario.name}, ${connections} connections... `);
        const result = await runScenario({
          baseUrl: app.baseUrl,
          scenario,
          context,
          headers,
          connections: scenario.connections ?? connections,
          duration: Number(options.duration),
          timeout: Number(options.timeout)
        });
        results.push(result);
        console.log(`${result.requestsPerSecond} req/s, p50 ${result.latency.p50} ms, p99 ${result.latency.p99} ms`);
      }
    }

    const report = {
      sample: sample.name,
      runtime: sample.runtime,
      database: sample.database,
      size,
      date: new Date().toISOString(),
      commit: gitCommit(),
      environment: {
        node: process.version,
        cpus: os.cpus().length,
        cpuModel: os.cpus()[0]?.model,
        memoryGb: Math.round(os.totalmem() / 1024 ** 3)
      },
      results
    };
    const outputDir = path.resolve(rootDir, options.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });
    const file = path.join(outputDir, `${sample.name}-${sizeLabel(size)}-${report.date.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report written to ${path.relative(rootDir, file)}`);
    return report;
  } finally {
    await app.stop();
    if (options.teardown && sample.services?.length) {
      spawnSync('docker', ['compose', 'stop', ...sample.services], { cwd: sample.dir, stdio: 'ignore' });
    }
  }
}

/**
 * Prepares a sample to run: its `.env` from `.env.example` when it has none, and the Docker Compose services of its
 * database and Redis, waiting until they are healthy.
 */
function setupProject(sample, options) {
  const envFile = path.join(sample.dir, '.env');
  const exampleFile = path.join(sample.dir, '.env.example');
  if (!fs.existsSync(envFile) && fs.existsSync(exampleFile)) {
    fs.copyFileSync(exampleFile, envFile);
    console.log(`${sample.name}: .env created from .env.example`);
  }
  if (sample.services?.length) {
    const result = spawnSync('docker', ['compose', 'up', '-d', '--wait', ...sample.services], {
      cwd: sample.dir,
      stdio: options.verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      throw new Error(`docker compose up failed in ${sample.name}:\n${result.stderr ?? ''}`);
    }
  }
}

/** Runs a `weaver` command in the directory of the sample, with Bun in a Bun sample. */
function weaver(sample, args, env, options) {
  const cli = path.join(rootDir, 'node_modules', '@appweaver', 'cli', 'weaver.js');
  const [command, commandArgs] =
    sample.runtime === 'bun' ? ['bun', [cli, ...args]] : [process.execPath, [cli, ...args]];
  const result = spawnSync(command, commandArgs, {
    cwd: sample.dir,
    env: { ...process.env, ...binPath(), NODE_ENV: 'prod', ...sample.env, ...env },
    stdio: options.verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  });
  if (!options.verbose) {
    const lines = `${result.stdout ?? ''}`.trim().split('\n').filter(Boolean);
    if (lines.length) {
      console.log(lines.slice(-3).join('\n'));
    }
  }
  if (result.status !== 0) {
    throw new Error(`weaver ${args.join(' ')} failed in ${sample.name}:\n${result.stderr ?? ''}${result.stdout ?? ''}`);
  }
}

/** The binaries of the root, i.e. `tsc` and `prisma`, on the `PATH` like `npm run` does. */
function binPath() {
  const key = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  return { [key]: `${path.join(rootDir, 'node_modules', '.bin')}${path.delimiter}${process.env[key] ?? ''}` };
}

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}
