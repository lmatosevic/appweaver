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
  updatedAt: StringDate(),
  createdAt: StringDate(),
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
  Relations: 'relationsModel',
  Virtual: 'virtualModel',
  Files: 'filesModel',
  FileUpload: 'fileUploadModel',
  FileDelete: 'fileDeleteModel'
};
