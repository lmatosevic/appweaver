import { HealthCheckStatus } from '@appweaver/common';
import { healthCheckConfig } from './health-check-config';
import { createHealthCheckSchema, healthReadySchema } from './health-schema';
import { HealthService, inject } from '@appweaver/core';
import { Server } from '../types/server';

/**
 * Registers the health check and readiness routes.
 *
 * @param {Server} server - The server to register the routes on.
 */
export function health(server: Server): void {
  const { authenticate } = server;

  const healthService = inject(HealthService);

  const healthCheckSchema = createHealthCheckSchema(
    healthService.healthCheckInstances().map((s) => s.name)
  );

  server.get(
    '/check',
    {
      schema: healthCheckSchema,
      onRequest: healthCheckConfig.AUTH ? authenticate() : undefined,
      config: {
        cacheTTL: healthCheckConfig.CACHE_TTL,
        rateLimit: {
          max: 12
        }
      }
    },
    async (_, reply) => {
      const healthCheck = await healthService.checkHealth();

      const allUp = Object.values(healthCheck).every(
        (check) => check.status === HealthCheckStatus.Up
      );

      return reply.status(allUp ? 200 : 503).send({
        status: allUp ? HealthCheckStatus.Up : HealthCheckStatus.Down,
        timestamp: new Date(),
        checks: healthCheck
      });
    }
  );

  server.get(
    '/ready',
    {
      schema: healthReadySchema
    },
    async (_, reply) => {
      const ready = await healthService.checkReadiness();

      return reply.send({ ready });
    }
  );
}
