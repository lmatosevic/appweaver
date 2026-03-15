import { AuthType, config, HealthCheckStatus } from '@appweaver/common';
import { createHealthCheckSchema, healthReadySchema } from './health-schema';
import { HealthService } from './health-service';
import { inject } from '../context';
import { Server } from '../types';

export function health(server: Server): void {
  const { authenticate } = server;

  const healthService = inject(HealthService);

  const healthCheckSchema = createHealthCheckSchema(
    healthService.healthCheckServices().map((s) => s.name)
  );

  server.get(
    '/check',
    {
      schema: healthCheckSchema,
      onRequest: config.HEALTH_CHECK_AUTH
        ? authenticate(AuthType.Jwt, AuthType.ApiKey, AuthType.Basic)
        : undefined,
      config: {
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

      return reply.status(200).send({ ready });
    }
  );
}
