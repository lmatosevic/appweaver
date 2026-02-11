import { Type } from '@sinclair/typebox';
import { Nullable, StringDate } from '../utils';
import { ResourceModelSchema } from '../types';

export const Id = Type.Object({
  id: Type.Integer({ minimum: 1 })
});

export const IdString = Type.Object({
  id: Type.String({ maxLength: 36 })
});

export const AuditData = Type.Object({
  updatedAt: StringDate({
    examples: ['2025-04-11T11:27:58.590Z']
  }),
  createdAt: StringDate({
    examples: ['2025-04-11T11:27:58.590Z']
  }),
  createdById: Nullable(Type.Integer({ minimum: 1, examples: [1] }))
});

export const resourceModelProps: Record<
  string,
  keyof Partial<Omit<ResourceModelSchema, 'name' | 'config'>>
> = {
  '': 'readModel',
  Single: 'readOneModel',
  Multiple: 'readManyModel',
  Create: 'createOneModel',
  Update: 'updateOneModel',
  Files: 'filesModel',
  FileUpload: 'fileUploadModel',
  FileDelete: 'fileDeleteModel'
};
