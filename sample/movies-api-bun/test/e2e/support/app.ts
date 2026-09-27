import { Application, createApp } from '@appweaver/core';

let app: Promise<Application> | undefined;

/**
 * The application every end-to-end test file shares. Bun runs all the files
 * in one process, where the application context is frozen once an application
 * starts, so a second one cannot be created. The preload stops it after the
 * last file, and each file keeps its data apart with unique names instead of
 * resetting the database in between.
 */
export function testApp(): Promise<Application> {
  app ??= createApp({ autoStartServer: false });
  return app;
}

/** Stops the shared application, if a test file created it. */
export async function stopTestApp(): Promise<void> {
  if (app) {
    await (await app).stop();
    app = undefined;
  }
}
