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
