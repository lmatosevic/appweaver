import Fastify from 'fastify';
import { HealthCheckStatus } from '@appweaver/common';
import { define, HealthService } from '@appweaver/core';
import { resetContext } from '@appweaver/testing';
import { ProblemDetailsSchema } from '../../errors';
import { health } from '../../health/health-routes';
import { ReadyResponse } from '../../health/health-schema';
import { Server } from '../../types/server';

describe('health-routes', () => {
  let server: Server;
  let ready: boolean;

  beforeEach(async () => {
    resetContext();
    ready = true;
    define(
      {
        checkHealth: async () => ({
          database: { status: HealthCheckStatus.Up }
        }),
        checkReadiness: async () => ready,
        healthCheckInstances: () => [{ name: 'database' }]
      },
      HealthService
    );

    server = Fastify();
    // The schemas the health check creates while registering are added to the running server
    define({ instance: server }, 'HttpServer');
    server.addSchema(ProblemDetailsSchema);
    server.addSchema(ReadyResponse);
    server.decorate('authenticate', () => async () => {});
    server.register(health, { prefix: '/health' });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  afterAll(() => {
    resetContext();
  });

  describe('health', () => {
    test('responds with 200 when ready', async () => {
      const response = await server.inject({ url: '/health/ready' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ready: true });
    });

    test('responds with 503 while not ready', async () => {
      ready = false;

      const response = await server.inject({ url: '/health/ready' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ ready: false });
    });
  });
});
