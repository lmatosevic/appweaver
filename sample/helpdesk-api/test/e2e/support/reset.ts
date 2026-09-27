import { spawnSync } from 'node:child_process';

/**
 * Clears the test database and the file storage. Register it with `afterAll`
 * in every end-to-end test file, after the hook that stops the application, so
 * each test file starts from an empty database:
 *
 * ```ts
 * afterAll(async () => {
 *   await app.stop();
 * });
 *
 * afterAll(resetTestData, 10_000);
 * ```
 */
export function resetTestData(): void {
  const { error } = spawnSync('weaver test reset', {
    stdio: 'inherit',
    shell: true
  });

  if (error) {
    console.error(error);
    process.exit(1);
  }
}
