import { TSchema, Type } from '@sinclair/typebox';
import {
  AuthType,
  config,
  HealthCheckStatus,
  RouteSchema,
  StringDate,
  StringEnum
} from '@appweaver/common';
import { errorResponses } from '../errors';
import { authErrorCodes } from '../security/auth-schema';
import { createSchemaModel } from '../utils';

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
    security: config.HEALTH_CHECK_AUTH ? [{ bearer: [] }] : [],
    summary: 'Health check status',
    description: 'Health check status',
    response: {
      200: healthCheckResponse,
      503: healthCheckResponse,
      ...errorResponses(
        ...(config.HEALTH_CHECK_AUTH ? authErrorCodes([AuthType.Jwt]) : [])
      )
    }
  };
}
