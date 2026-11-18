import { Application, createApp } from '@appweaver/core';

let app: Promise<Application> | undefined;
let baseUrl: Promise<string> | undefined;

/**
 * The application every end-to-end test file shares. Bun runs all the files
 * in one process, where the application context is frozen once an application
 * starts, so a second one cannot be created. The preload stops it after the
 * last file, and each file keeps its data apart with unique names instead of
 * resetting the database in between.
 */
export function testApp(): Promise<Application> {
  app ??= createApp();
  return app;
}

/**
 * The URL of the shared application, listening on a random port once a test
 * file needs it: the test configuration does not listen, and the realtime
 * clients need a WebSocket and event streams.
 */
export function testAppUrl(): Promise<string> {
  baseUrl ??= testApp().then(async (started) => {
    await started.server.listen({ host: '127.0.0.1', port: 0 });
    const { port } = started.server.server.address() as { port: number };
    return `http://127.0.0.1:${port}`;
  });
  return baseUrl;
}

/** Stops the shared application, if a test file created it. */
export async function stopTestApp(): Promise<void> {
  if (app) {
    await (await app).stop();
    app = undefined;
    baseUrl = undefined;
  }
}
