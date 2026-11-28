#!/usr/bin/env node
// The idle and memory probe of the sample of the working directory (V3-PERF-02 of PLAN-v3.md, the measures of E5),
// run by the `probe` operation of tools/manage-samples.js: starts the built
// application with a preload counting the timer callbacks, records the memory after startup, the timer wake-ups of an
// idle window by the code that created each timer, and optionally the heap growth over a soak of the load scenarios.
// Node samples only: Bun implements neither `async_hooks.createHook` nor the IPC with a Node parent.
//
//   npm run samples:manage -- probe cms-api
//   npm run samples:manage -- probe cms-api -- --idle 60 --soak 120
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('commander');
const { rootDir, loadSample } = require('./lib/samples');
const { startApp, sleep } = require('./lib/app-process');
const { adminEmail, adminPassword, authenticate, createApi, runScenario } = require('./lib/runner');
const { createRandom } = require('./lib/seed-helpers');
const { diffSnapshots } = require('./lib/heap-diff');

const program = new Command('probe')
  .description(
    'Measures the idle timer wake-ups and the memory of the sample of the working directory, and the heap growth of a soak.'
  )
  .option('--settle <seconds>', 'The wait after startup before measuring.', '10')
  .option('--idle <seconds>', 'The idle window the timer wake-ups are counted in.', '60')
  .option('--soak <seconds>', 'The duration of the soak of the load scenarios (default: no soak).')
  .option('--connections <count>', 'The connections of the soak.', '10')
  .option('--output-dir <dir>', 'The directory of the JSON reports.', path.join('reports', 'load'))
  .option('--keep-snapshots', 'Keep the heap snapshots of the soak instead of deleting them.')
  .option('--verbose', 'Print the output of the application.')
  .action(main);

program.parseAsync().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main(options) {
  const sample = loadSample();
  if (sample.runtime === 'bun') {
    console.log(`${sample.name}: skipped, the probe runs on Node only`);
    return;
  }
  if (sample.port === undefined) {
    console.log(`${sample.name}: skipped, it serves no readiness route`);
    return;
  }
  printReport(await probe(sample, options));
}

async function probe(sample, options) {
  const env = { SYSTEM_ADMIN_INITIAL_PASSWORD: adminPassword, SYSTEM_ADMIN_INITIAL_EMAIL: adminEmail };
  const startedAt = Date.now();
  const app = await startApp(sample, {
    env,
    ipc: true,
    nodeArgs: ['--expose-gc', '-r', path.join(__dirname, 'lib', 'probe-preload.js')],
    verbose: options.verbose
  });
  const readyMs = Date.now() - startedAt;
  const ask = createAsk(app.child);
  const outputDir = path.resolve(rootDir, options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    console.log(`${sample.name}: ready in ${readyMs} ms, settling for ${options.settle} s`);
    await sleep(Number(options.settle) * 1000);
    const startup = (await ask({ probe: 'memory' })).memory;

    console.log(`${sample.name}: counting the timer wake-ups of ${options.idle} s of idle`);
    await ask({ probe: 'start' });
    await sleep(Number(options.idle) * 1000);
    const { counts } = await ask({ probe: 'stop' });
    const idle = (await ask({ probe: 'memory' })).memory;

    let soak;
    if (options.soak) {
      soak = await runSoak(sample, app, ask, outputDir, options);
    }

    const report = {
      sample: sample.name,
      database: sample.database,
      date: new Date().toISOString(),
      environment: { node: process.version, cpus: os.cpus().length },
      readyMs,
      memory: { startup, idle },
      idleSeconds: Number(options.idle),
      wakeUps: {
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        byOrigin: counts
      },
      soak
    };
    const file = path.join(outputDir, `${sample.name}-probe-${report.date.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report written to ${path.relative(rootDir, file)}`);
    return report;
  } finally {
    await app.stop();
  }
}

/** Runs the scenarios of the sample in turn for the soak duration, between two heap snapshots. */
async function runSoak(sample, app, ask, outputDir, options) {
  const headers = await authenticate(sample, app.baseUrl);
  const api = createApi(app.baseUrl, headers);
  const context = { random: createRandom(1), ...(sample.prepare ? await sample.prepare(api) : {}) };
  const stamp = Date.now();
  const before = (await ask({ probe: 'snapshot', file: path.join(outputDir, `${sample.name}-${stamp}-before.heapsnapshot`) }))
    .file;
  const memoryBefore = (await ask({ probe: 'memory' })).memory;

  const deadline = Date.now() + Number(options.soak) * 1000;
  const perScenario = Math.max(5, Math.floor(Number(options.soak) / Math.max(1, sample.scenarios.length)));
  let requests = 0;
  console.log(`${sample.name}: soaking for ${options.soak} s`);
  while (Date.now() < deadline) {
    for (const scenario of sample.scenarios) {
      if (Date.now() >= deadline) {
        break;
      }
      const result = await runScenario({
        baseUrl: app.baseUrl,
        scenario,
        context,
        headers,
        connections: Number(options.connections),
        duration: perScenario,
        timeout: 10
      });
      requests += result.requests;
    }
  }
  await sleep(5_000);
  const memoryAfter = (await ask({ probe: 'memory' })).memory;
  const after = (await ask({ probe: 'snapshot', file: path.join(outputDir, `${sample.name}-${stamp}-after.heapsnapshot`) }))
    .file;
  const diff = diffSnapshots(before, after);
  if (!options.keepSnapshots) {
    fs.rmSync(before, { force: true });
    fs.rmSync(after, { force: true });
  }
  return { seconds: Number(options.soak), requests, memoryBefore, memoryAfter, heap: diff };
}

/** Sends a request to the preload of the application and waits for its answer. */
function createAsk(child) {
  return (message) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`The probe ${message.probe} got no answer`)), 120_000);
      const onMessage = (answer) => {
        if (answer?.probe === message.probe) {
          clearTimeout(timer);
          child.off('message', onMessage);
          resolve(answer);
        }
      };
      child.on('message', onMessage);
      child.send(message);
    });
}

function printReport(report) {
  const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;
  const { startup, idle } = report.memory;
  console.log(`\n${report.sample}: ready in ${report.readyMs} ms`);
  console.log(`  startup: RSS ${mb(startup.rss)}, heap ${mb(startup.heapUsed)} / ${mb(startup.heapTotal)}`);
  console.log(`  idle:    RSS ${mb(idle.rss)}, heap ${mb(idle.heapUsed)} / ${mb(idle.heapTotal)}`);
  console.log(`  timer wake-ups in ${report.idleSeconds} s of idle: ${report.wakeUps.total}`);
  for (const [origin, count] of Object.entries(report.wakeUps.byOrigin)) {
    console.log(`    ${String(count).padStart(5)}  ${origin}`);
  }
  if (report.soak) {
    const { memoryBefore, memoryAfter, heap, requests } = report.soak;
    console.log(`  soak: ${requests} requests in ${report.soak.seconds} s`);
    console.log(`    heap ${mb(memoryBefore.heapUsed)} -> ${mb(memoryAfter.heapUsed)}, RSS ${mb(memoryBefore.rss)} -> ${mb(memoryAfter.rss)}`);
    for (const group of heap.growth.slice(0, 10)) {
      console.log(`    +${String(Math.round(group.sizeDelta / 1024)).padStart(7)} KB  +${group.countDelta}  ${group.name}`);
    }
  }
}
