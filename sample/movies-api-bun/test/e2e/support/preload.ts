import { afterAll, beforeAll } from 'bun:test';
import { stopTestApp } from './app';
import setup from './setup';
import teardown from './teardown';

// Generating the schema, resetting and migrating the test database can take
// longer than the default hook timeout of Bun
beforeAll(async () => {
  await setup();
}, 60_000);

afterAll(async () => {
  await stopTestApp();
  // Wait for database connection to close before calling teardown
  await Bun.sleep(100);
  await teardown();
}, 10_000);
