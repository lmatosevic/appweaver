import { HealthCheckStatus } from '@appweaver/common';
import { healthService } from './health-service';
import { createHealthCheckSchema, healthReadySchema } from './health-schema';
import { Server } from '../types';

export function health(server: Server): void {
  const healthCheckSchema = createHealthCheckSchema(
    healthService.healthCheckServices().map((s) => s.name)
  );

  server.get(
    '/check',
    {
      schema: healthCheckSchema,
      config: {
        rateLimit: {
          max: 12
        }
      }
    },
    async (_, reply) => {
      const healthCheck = await healthService.checkHealth();

      const statusCode = Object.values(healthCheck).every(
        (v) => v === HealthCheckStatus.Up
      )
        ? 200
        : 503;

      reply.status(statusCode).send(healthCheck);
    }
  );

  server.get(
    '/ready',
    {
      schema: healthReadySchema
    },
    async (_, reply) => {
      const ready = await healthService.checkReadiness();

      reply.status(200).send({ ready });
    }
  );
}
