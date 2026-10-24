import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  HealthCheckStatus,
  LIFECYCLE,
  logger,
  OnReady,
  OnShutdown
} from '@appweaver/common';
import { inject } from '../context';
import { healthConfig } from './health-config';
import { HealthService } from './health-service';

/**
 * Answers the health checks of an application without the HTTP server of `@appweaver/web`, i.e. a worker in a
 * container, on `health.port` with a small `node:http` listener running the checks of the health route.
 */
export class HealthListener implements OnReady, OnShutdown {
  static [LIFECYCLE] = true;

  /** @internal */
  private _server?: http.Server;

  public async onReady(): Promise<void> {
    if (!healthConfig.PORT) {
      return;
    }

    const healthService = inject(HealthService);
    this._server = http.createServer(async (request, response) => {
      const path = request.url?.split('?')[0];
      let status = 404;
      let body: object = { message: 'Not found' };

      if (request.method === 'GET' && path === '/health/check') {
        const checks = await healthService.checkHealth();
        const allUp = Object.values(checks).every(
          (check) => check.status === HealthCheckStatus.Up
        );
        status = allUp ? 200 : 503;
        body = {
          status: allUp ? HealthCheckStatus.Up : HealthCheckStatus.Down,
          timestamp: new Date(),
          checks
        };
      } else if (request.method === 'GET' && path === '/health/ready') {
        status = 200;
        body = { ready: await healthService.checkReadiness() };
      }

      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    });

    await new Promise<void>((resolve, reject) => {
      this._server!.once('error', reject);
      this._server!.listen(healthConfig.PORT, healthConfig.HOST, resolve);
    });
    logger.info(`Health listener on port ${this.port()}`);
  }

  public async onShutdown(): Promise<void> {
    const server = this._server;
    this._server = undefined;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  /**
   * Returns the port the listener listens on, i.e. the one the system assigned for the port `0`.
   *
   * @return {number | undefined} The port, or undefined when the listener is not started.
   */
  public port(): number | undefined {
    return (this._server?.address() as AddressInfo | null)?.port;
  }
}
