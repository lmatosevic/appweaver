import { Type } from '@sinclair/typebox';
import { AllErrorResponses } from '../errors';
import { createSchemaModel } from '../utils';

export const InfoResponse = Type.Object(
  {
    name: Type.String(),
    version: Type.String()
  },
  { $id: 'InfoResponse' }
);

export const infoSchema = {
  tags: ['Info'],
  summary: 'Application info',
  description: 'Application info',
  response: {
    200: createSchemaModel(InfoResponse),
    ...AllErrorResponses
  }
};
