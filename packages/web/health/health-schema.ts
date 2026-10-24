import { TSchema, Type } from '@sinclair/typebox';
import {
  AuthType,
  HealthCheckStatus,
  RouteSchema,
  StringDate,
  StringEnum
} from '@appweaver/common';
import { healthCheckConfig } from './health-check-config';
import { errorResponses } from '../errors';
import { authErrorCodes } from '../security/auth-schema';
import { createSchemaModel } from '@appweaver/core';

export const HealthCheckResult = Type.Object({
  status: StringEnum(HealthCheckStatus),
  message: Type.Optional(Type.String())
});

export const HealthCheckCommonData = Type.Object({
  status: StringEnum(HealthCheckStatus),
  timestamp: StringDate()
});

export const ReadyResponse = Type.Object(
  {
    ready: Type.Boolean({ example: true })
  },
  { $id: 'HealthReadyResponse' }
);

export const healthReadySchema = {
  tags: ['Health'],
  summary: 'Application ready status',
  description: 'Application ready status',
  response: {
    200: createSchemaModel(ReadyResponse),
    ...errorResponses()
  }
};

/**
 * Builds the route schema of the health check, responding with the result of each named service.
 *
 * @param {string[]} serviceNames - The names of the checked services.
 * @return {RouteSchema} The route schema.
 */
export function createHealthCheckSchema(serviceNames: string[]): RouteSchema {
  const healthChecks: Record<string, TSchema> = {};

  const healthCheckResult = createSchemaModel(HealthCheckResult, {
    name: 'HealthCheckResult'
  });

  for (const service of serviceNames) {
    healthChecks[service] = healthCheckResult;
  }

  const healthCheckResponse = createSchemaModel(
    Type.Composite(
      [
        HealthCheckCommonData,
        Type.Object({ checks: Type.Object(healthChecks) })
      ],
      { $id: 'HealthCheckResponse' }
    )
  );

  return {
    tags: ['Health'],
    security: healthCheckConfig.AUTH ? [{ bearer: [] }] : [],
    summary: 'Health check status',
    description: 'Health check status',
    response: {
      200: healthCheckResponse,
      503: healthCheckResponse,
      ...errorResponses(
        ...(healthCheckConfig.AUTH ? authErrorCodes([AuthType.Jwt]) : [])
      )
    }
  };
}
