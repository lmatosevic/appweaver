import { Type } from '@sinclair/typebox';
import { AllErrorResponses } from '../errors';

export const InfoResponse = Type.Object({
  name: Type.String(),
  version: Type.String()
});

export const infoSchema = {
  tags: ['Info'],
  summary: 'Application info',
  description: 'Application info',
  response: {
    200: InfoResponse,
    ...AllErrorResponses
  }
};
