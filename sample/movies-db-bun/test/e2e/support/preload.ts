import { afterAll, beforeAll } from 'bun:test';
import { stopTestApp } from './app';
import setup from './setup';
import teardown from './teardown';

beforeAll(async () => {
  await setup();
}, 10_000);

afterAll(async () => {
  await stopTestApp();
  // Wait for database connection to close before calling teardown
  await Bun.sleep(100);
  await teardown();
}, 10_000);
