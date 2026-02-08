import { Type } from '@sinclair/typebox';
import { DateType, NullType } from '../utils';

export const Id = Type.Object({
  id: Type.Integer({ minimum: 1 })
});

export const IdString = Type.Object({
  id: Type.String({ maxLength: 36 })
});

export const AuditData = Type.Object({
  updatedAt: DateType({
    examples: ['2025-04-11T11:27:58.590Z']
  }),
  createdAt: DateType({
    examples: ['2025-04-11T11:27:58.590Z']
  }),
  createdById: NullType(Type.Integer({ minimum: 1, examples: [1] }))
});
