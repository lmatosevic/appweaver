// Preloaded into the application by tools/load/probe.js (`node -r`): counts the timer callbacks by the place that
// created the timer, and answers the memory and heap snapshot requests of the probe over the IPC channel.
const asyncHooks = require('async_hooks');
const path = require('path');
const v8 = require('v8');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const timerTypes = new Set(['Timeout', 'Immediate']);
const origins = new Map();
let counts = new Map();
let counting = false;

asyncHooks
  .createHook({
    init(asyncId, type) {
      if (timerTypes.has(type)) {
        origins.set(asyncId, { type, origin: timerOrigin() });
      }
    },
    before(asyncId) {
      const timer = counting && origins.get(asyncId);
      if (timer) {
        const key = `${timer.type} ${timer.origin}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    },
    destroy(asyncId) {
      origins.delete(asyncId);
    }
  })
  .enable();

/** The first frame of the stack outside Node and this file: the code that created the timer. */
function timerOrigin() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 30;
  const stack = new Error().stack.split('\n').slice(1);
  Error.stackTraceLimit = limit;
  const frame = stack.find(
    (line) => !line.includes('node:') && !line.includes(__filename) && !line.includes('(<anonymous>)')
  );
  if (!frame) {
    return 'node internals';
  }
  return frame
    .replace(/^\s*at\s+/, '')
    .split(rootDir + path.sep)
    .join('');
}

function memory() {
  global.gc?.();
  global.gc?.();
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers
  };
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object' || !message.probe) {
    return;
  }
  const reply = (data) => process.send({ probe: message.probe, ...data });
  switch (message.probe) {
    case 'start':
      counts = new Map();
      counting = true;
      reply({});
      break;
    case 'stop':
      counting = false;
      reply({ counts: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])) });
      break;
    case 'memory':
      reply({ memory: memory() });
      break;
    case 'snapshot':
      memory();
      reply({ file: v8.writeHeapSnapshot(message.file) });
      break;
  }
});
