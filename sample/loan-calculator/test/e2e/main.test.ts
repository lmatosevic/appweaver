import { HealthCheckStatus } from '@appweaver/common';
import { Application, createApp, HealthService, inject } from '@appweaver/core';

describe('Sample e2e test', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.stop();
  });

  test('Application is healthy', async () => {
    const health = inject(HealthService);

    expect(await health.checkReadiness()).toBe(true);
    for (const check of Object.values(await health.checkHealth())) {
      expect(check.status).toBe(HealthCheckStatus.Up);
    }
  });
});
