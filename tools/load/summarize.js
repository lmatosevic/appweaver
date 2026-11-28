#!/usr/bin/env node
// Prints the latest load and probe reports (reports/load) of the sample of the working directory as the Markdown tables
// of PLAN-v3.md, run by the `load-summary` operation of tools/manage-samples.js: its scenarios at each size and
// connection count, then the idle and memory measures of its probe.
//
//   npm run samples:manage -- load-summary
//   npm run samples:manage -- load-summary cms-api -- --sizes 10k,100k
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { rootDir, loadSample, sizeLabel, parseSize } = require('./lib/samples');

const program = new Command('summarize')
  .description('Prints the latest load and probe reports of the sample of the working directory as Markdown tables.')
  .option('--input-dir <dir>', 'The directory of the JSON reports.', path.join('reports', 'load'))
  .option('--sizes <list>', 'The sizes to print, comma separated.', '10k,100k')
  .action(main);

program.parse();

function main(options) {
  const { name } = loadSample();
  const dir = path.resolve(rootDir, options.inputDir);
  const reports = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
    .filter((report) => report.sample === name)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (reports.length === 0) {
    console.log(`${name} has no load report in ${path.relative(rootDir, dir)}`);
    return;
  }
  const sizes = options.sizes.split(',').map(parseSize);

  // The latest report of each sample, size and connection count
  const loads = new Map();
  for (const report of reports.filter((r) => r.results)) {
    for (const result of report.results) {
      loads.set(`${report.sample}|${report.size}|${result.connections}|${result.name}`, { report, result });
    }
  }
  const probes = new Map();
  for (const report of reports.filter((r) => r.wakeUps)) {
    probes.set(report.sample, report);
  }

  const samples = [...new Set([...loads.values()].map(({ report }) => report.sample))].sort();
  for (const sample of samples) {
    const entries = [...loads.values()].filter(({ report }) => report.sample === sample);
    const { report } = entries.at(-1);
    console.log(`#### \`${sample}\` (${report.database}, ${report.runtime})\n`);
    const columns = [];
    for (const size of sizes) {
      const connections = [
        ...new Set(entries.filter((e) => e.report.size === size).map((e) => e.result.connections))
      ].sort((a, b) => a - b);
      for (const count of connections) {
        columns.push({ size, connections: count });
      }
    }
    const scenarios = [...new Set(entries.map((e) => e.result.name))];
    const header = ['Scenario', ...columns.map((c) => `${sizeLabel(c.size)}, ${c.connections} conn.: req/s, p50, p99`)];
    const rows = scenarios.map((name) => [
      `\`${name}\``,
      ...columns.map((c) => {
        const entry = loads.get(`${sample}|${c.size}|${c.connections}|${name}`);
        return entry ? cell(entry.result) : 'n/a';
      })
    ]);
    console.log(table([header, ...rows]));
    console.log();
  }

  if (probes.size) {
    const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;
    const header = ['Sample', 'Ready', 'RSS / heap after startup', 'Wake-ups in 60 s of idle (by origin)', 'Soak: heap, RSS'];
    const rows = [...probes.values()]
      .sort((a, b) => a.sample.localeCompare(b.sample))
      .map((probe) => [
        `\`${probe.sample}\``,
        `${(probe.readyMs / 1000).toFixed(1)} s`,
        `${mb(probe.memory.startup.rss)} / ${mb(probe.memory.startup.heapUsed)}`,
        `${probe.wakeUps.total}${origins(probe.wakeUps.byOrigin)}`,
        probe.soak
          ? `${mb(probe.soak.memoryBefore.heapUsed)} → ${mb(probe.soak.memoryAfter.heapUsed)}, ${mb(
              probe.soak.memoryBefore.rss
            )} → ${mb(probe.soak.memoryAfter.rss)}`
          : '-'
      ]);
    console.log(table([header, ...rows]));
  }
}

function cell(result) {
  const failed = result.timeouts ? `, ${result.timeouts} timeouts` : result.non2xx ? `, ${result.non2xx} non-2xx` : '';
  return `${result.requestsPerSecond.toLocaleString('en-US')}, ${result.latency.p50} ms, ${result.latency.p99} ms${failed}`;
}

/** The origins of the wake-ups, shortened to their package or file. */
function origins(byOrigin) {
  const grouped = {};
  for (const [origin, count] of Object.entries(byOrigin)) {
    const name =
      /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(origin)?.[1] ??
      /packages\/([^/]+)/.exec(origin)?.[1] ??
      (origin.includes('node internals') ? 'node' : origin.split(' ')[1]);
    grouped[name] = (grouped[name] ?? 0) + count;
  }
  const parts = Object.entries(grouped).map(([name, count]) => `${name} ${count}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function table(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  const line = (row) => `| ${row.map((value, i) => value.padEnd(widths[i])).join(' | ')} |`;
  return [line(rows[0]), `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`, ...rows.slice(1).map(line)].join('\n');
}
