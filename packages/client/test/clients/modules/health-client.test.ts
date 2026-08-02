import { HealthClient } from '../../../clients/modules/health-client';
import { ClientError } from '../../../errors';
import { createStubClient } from '../../fixtures/stub-client';

describe('health-client', () => {
  describe('check', () => {
    test('returns the health check data', async () => {
      const stub = createStubClient({ data: { status: 'up' } });
      const health = new HealthClient<any>(stub.client, '/health');

      await expect(health.check()).resolves.toEqual({ status: 'up' });
      expect(stub.lastCall()).toMatchObject({
        method: 'get',
        path: '/health/check'
      });
    });

    test('returns the error body for an unavailable service response', async () => {
      const stub = createStubClient({
        error: { status: 'down', services: { database: 'down' } },
        response: new Response(null, { status: 503 })
      });
      const health = new HealthClient<any>(stub.client, '/health');

      await expect(health.check()).resolves.toEqual({
        status: 'down',
        services: { database: 'down' }
      });
    });

    test('throws a ClientError for any other error response', async () => {
      const stub = createStubClient({
        error: { message: 'Forbidden', errorCode: 403 },
        response: new Response(null, { status: 403 })
      });
      const health = new HealthClient<any>(stub.client, '/health');

      await expect(health.check()).rejects.toThrow(ClientError);
    });
  });

  describe('ready', () => {
    test('requests the readiness endpoint', async () => {
      const stub = createStubClient({ data: { ready: true } });
      const health = new HealthClient<any>(stub.client, '/health');

      await expect(health.ready()).resolves.toEqual({ ready: true });
      expect(stub.lastCall()).toMatchObject({
        method: 'get',
        path: '/health/ready'
      });
    });
  });
});
