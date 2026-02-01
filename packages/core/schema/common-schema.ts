import { Type } from '@sinclair/typebox';
import { StringDate } from '../utils';

export const CommonId = Type.Object({
  id: Type.Integer({ minimum: 1 })
});

export const CommonData = Type.Object({
  updatedAt: StringDate({
    examples: ['2025-04-11T11:27:58.590Z']
  }),
  createdAt: StringDate({
    examples: ['2025-04-11T11:27:58.590Z']
  })
});

export const CommonProperties = [
  ...Object.keys(CommonId.properties),
  ...Object.keys(CommonData.properties)
];
