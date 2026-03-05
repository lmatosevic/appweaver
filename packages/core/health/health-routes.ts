import { HealthCheckStatus } from '@appweaver/common';
import { createHealthCheckSchema, healthReadySchema } from './health-schema';
import { HealthService } from './health-service';
import { inject } from '../context';
import { Server } from '../types';

export function health(server: Server): void {
  const healthService = inject(HealthService);

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
        (check) => check.status === HealthCheckStatus.Up
      )
        ? 200
        : 503;

      return reply.status(statusCode).send(healthCheck);
    }
  );

  server.get(
    '/ready',
    {
      schema: healthReadySchema
    },
    async (_, reply) => {
      const ready = await healthService.checkReadiness();

      return reply.status(200).send({ ready });
    }
  );
}
