import net from 'node:net';
import { configOverrides, HealthCheckStatus } from '@appweaver/common';
import { define } from '../../context/dependency-injection';
import { HealthListener } from '../../health/health-listener';
import { HealthService } from '../../health/health-service';
import { resetContext } from '../fixtures/context-fixture';

/** Finds a free port of the host. */
async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe('health-listener', () => {
  let listener: HealthListener;
  let status: HealthCheckStatus;

  beforeEach(() => {
    resetContext();
    status = HealthCheckStatus.Up;
    define(
      {
        checkHealth: async () => ({ database: { status } }),
        checkReadiness: async () => true
      },
      HealthService
    );
    listener = new HealthListener();
  });

  afterEach(async () => {
    await listener.onShutdown();
    delete configOverrides.HEALTH_PORT;
  });

  afterAll(() => {
    resetContext();
  });

  describe('onReady', () => {
    test('starts no listener without a port', async () => {
      await listener.onReady();

      expect(listener.port()).toBeUndefined();
    });

    test('answers the health checks on the configured port', async () => {
      const port = await freePort();
      configOverrides.HEALTH_PORT = port;

      await listener.onReady();
      const check = await fetch(`http://localhost:${port}/health/check`);
      const ready = await fetch(`http://localhost:${port}/health/ready`);
      const missing = await fetch(`http://localhost:${port}/other`);

      expect(listener.port()).toBe(port);
      expect(check.status).toBe(200);
      expect(await check.json()).toMatchObject({
        status: HealthCheckStatus.Up,
        checks: { database: { status: HealthCheckStatus.Up } }
      });
      expect(await ready.json()).toEqual({ ready: true });
      expect(missing.status).toBe(404);
    });

    test('responds with 503 when a check is down', async () => {
      const port = await freePort();
      configOverrides.HEALTH_PORT = port;
      status = HealthCheckStatus.Down;

      await listener.onReady();
      const check = await fetch(`http://localhost:${port}/health/check`);

      expect(check.status).toBe(503);
    });
  });

  describe('onShutdown', () => {
    test('closes the listener', async () => {
      configOverrides.HEALTH_PORT = await freePort();
      await listener.onReady();

      await listener.onShutdown();

      expect(listener.port()).toBeUndefined();
    });
  });
});
