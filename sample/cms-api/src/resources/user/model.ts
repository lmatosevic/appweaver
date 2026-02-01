import { Static, Type } from '@sinclair/typebox';
import {
  resourceConfig,
  CommonId,
  CommonData,
  CommonProperties,
  File,
  Nullable
} from '@appweaver/core';

export const User = Type.Composite([
  CommonId,
  Type.Object({
    firstName: Type.String({ maxLength: 255 }),
    lastName: Type.String({ maxLength: 255 }),
    email: Type.String({ maxLength: 255, format: 'email' }),
    phone: Nullable(Type.String({ maxLength: 25 }))
  }),
  CommonData
]);

export const UserCreate = Type.Omit(User, CommonProperties);

export const UserUpdate = Type.Partial(UserCreate);

export const UserFiles = Type.Object({ avatar: File });

export default resourceConfig<
  Static<typeof User>,
  unknown,
  Static<typeof UserFiles>
>('User', {
  readModel: User,
  createModel: UserCreate,
  updateModel: UserUpdate,
  fileModel: UserFiles,
  fileConfig: {
    avatar: {
      optional: true,
      maxSize: '5 MB'
    }
  }
});
