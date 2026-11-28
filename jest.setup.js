// Logs are written synchronously here, so a record cannot be lost or reordered
// when a worker exits, and pino registers no exit hook to flush what it would
// otherwise buffer.
process.env.LOG_SYNC = 'true';

// Jest gives every test file its own module registry, so a dependency adding a
// process listener at module scope adds one per file, while the worker process
// running them is shared. The listeners are bound by the number of test files
// and released with the worker, so the limit is lifted rather than warned about
// on every run.
process.setMaxListeners(0);

// No test installs packages in the repository (V3-QA-02 of PLAN-v3.md): a
// test of a command installing packages mocks the installation, or runs it in
// a temporary project given as the explicit cwd. A test relying on
// process.chdir() alone would install into the repository under a runner
// without it (Vitest's worker threads did, changing package.json and the
// lockfile), so such a spawn fails the test instead.
const childProcess = require('node:child_process');
const path = require('node:path');
const installPattern =
  /(^|[\s;&|])(npm|pnpm|yarn|bun)(\.cmd)?\s+(install|i|ci|add|update|upgrade|uninstall|remove|rm)(\s|$)/;

function assertNoInstallInRepository(command, args, options) {
  const line = [command, ...(Array.isArray(args) ? args : [])].join(' ');
  if (!installPattern.test(line)) {
    return;
  }
  const cwd = path.resolve(
    (options && options.cwd && String(options.cwd)) || process.cwd()
  );
  const relative = path.relative(__dirname, cwd);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error(
      `A test ran "${line}" in the repository (${cwd}). Mock the installation, or give the command a temporary project as its cwd.`
    );
  }
}

// The setup runs for every test file, while the module is shared by the worker
const guarded = Symbol.for('appweaver.installGuard');
for (const name of [
  'spawn',
  'spawnSync',
  'exec',
  'execSync',
  'execFile',
  'execFileSync'
]) {
  const original = childProcess[name];
  if (original[guarded]) {
    continue;
  }
  const guard = function (command, args, options) {
    const [argv, opts] = Array.isArray(args) ? [args, options] : [[], args];
    assertNoInstallInRepository(command, argv, opts);
    return original.apply(this, arguments);
  };
  guard[guarded] = true;
  childProcess[name] = guard;
}
