const { spawn } = require('child_process');
const path = require('path');

/**
 * Starts the built application of a sample (`node dist/src/main.js`, or `bun src/main.ts` for a Bun sample) and waits
 * until its readiness route answers.
 *
 * @param {object} sample - The loaded sample definition.
 * @param {object} [options]
 * @param {object} [options.env] - Extra environment variables, over those of the sample definition.
 * @param {string[]} [options.nodeArgs] - Arguments of the runtime before the main file, i.e. a `-r` preload.
 * @param {boolean} [options.ipc] - Opens an IPC channel to the process (Node only).
 * @param {boolean} [options.verbose] - Prints the output of the application.
 * @param {number} [options.timeout] - How long to wait for the readiness, in milliseconds.
 */
async function startApp(sample, options = {}) {
  const [command, args] =
    sample.runtime === 'bun'
      ? ['bun', [...(options.nodeArgs ?? []), 'src/main.ts']]
      : [process.execPath, [...(options.nodeArgs ?? []), path.join('dist', 'src', 'main.js')]];
  const env = { ...process.env, NODE_ENV: 'prod', ...sample.env, ...options.env };
  const child = spawn(command, args, {
    cwd: sample.dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe', ...(options.ipc ? ['ipc'] : [])]
  });

  const output = [];
  const collect = (chunk) => {
    output.push(chunk.toString());
    if (output.length > 200) {
      output.shift();
    }
    if (options.verbose) {
      process.stderr.write(chunk);
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  let exited = null;
  child.on('exit', (code, signal) => {
    exited = { code, signal };
  });

  const baseUrl = `http://localhost:${sample.port}`;
  const deadline = Date.now() + (options.timeout ?? 60_000);
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `${sample.name} exited (${exited.code ?? exited.signal}) before it was ready:\n${output.join('')}`
      );
    }
    try {
      const response = await fetch(`${baseUrl}${sample.readyPath ?? '/health/ready'}`);
      if (response.ok) {
        return { child, baseUrl, output, stop: () => stopApp(child) };
      }
    } catch {
      // Not listening yet
    }
    await sleep(250);
  }
  await stopApp(child);
  throw new Error(`${sample.name} was not ready in time:\n${output.join('')}`);
}

/** Stops the application with `SIGTERM`, then `SIGKILL` after 15 seconds. */
function stopApp(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startApp, stopApp, sleep };
