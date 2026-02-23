import { TObject, Type } from '@sinclair/typebox';
import { StringEnum, HealthCheckStatus } from '@appweaver/common';
import { AllErrorResponses } from '../errors';
import { RouteSchema } from '../types';

export const HealthStatus = Type.Object({
  status: StringEnum(HealthCheckStatus),
  message: Type.Optional(Type.String())
});

export const ReadyResponse = Type.Object({
  ready: Type.Boolean({ examples: [true] })
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

  const healthResponse = Type.Object(healthServices);

  return {
    tags: ['Health'],
    summary: 'Health check status',
    description: 'Health check status',
    response: {
      200: healthResponse,
      503: healthResponse,
      ...AllErrorResponses
    }
  };
}
