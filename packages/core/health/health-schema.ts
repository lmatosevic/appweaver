import { TObject, Type } from '@sinclair/typebox';
import {
  config,
  HealthCheckStatus,
  RouteSchema,
  StringDate,
  StringEnum
} from '@appweaver/common';
import { AllErrorResponses } from '../errors';

export const HealthStatus = Type.Object({
  status: StringEnum(HealthCheckStatus),
  message: Type.Optional(Type.String())
});

export const HealthCheckCommonData = Type.Object({
  status: StringEnum(HealthCheckStatus),
  timestamp: StringDate()
});

export const ReadyResponse = Type.Object({
  ready: Type.Boolean({ example: true })
});

export const healthReadySchema = {
  tags: ['Health'],
  summary: 'Application ready status',
  description: 'Application ready status',
  response: {
    200: ReadyResponse,
    ...AllErrorResponses
  }
};

export function createHealthCheckSchema(serviceNames: string[]): RouteSchema {
  const healthServices: Record<string, TObject> = {};

  for (const service of serviceNames) {
    healthServices[service] = HealthStatus;
  }

  const healthResponse = Type.Composite([
    HealthCheckCommonData,
    Type.Object({ checks: Type.Object(healthServices) })
  ]);

  return {
    tags: ['Health'],
    security: config.HEALTH_CHECK_AUTH ? [{ bearer: [] }] : [],
    summary: 'Health check status',
    description: 'Health check status',
    response: {
      200: healthResponse,
      503: healthResponse,
      ...AllErrorResponses
    }
  };
}
