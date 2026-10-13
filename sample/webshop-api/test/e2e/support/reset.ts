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
  const { error, status } = spawnSync('weaver test reset', {
    stdio: 'inherit',
    shell: true
  });

  // A command that ran but failed sets a non-zero status, not the error
  if (error || status !== 0) {
    throw (
      error ??
      new Error(`"weaver test reset" failed with exit status ${status}`)
    );
  }
}
