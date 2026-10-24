import { AuthSource, AuthUser } from '@appweaver/common';
import { FileBuffer } from './storage';

export type AvatarFile = FileBuffer & {
  size: number;
};

export type UserInfo = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  avatarFile?: AvatarFile;
};

export type UserAdditionalData = {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  avatarFile?: AvatarFile;
};

export type RegistrationDataFn<T = any> = (
  source: AuthSource,
  email: string,
  password?: string,
  additionalData?: Partial<UserAdditionalData>
) => T | Promise<T>;

export type RegistrationFilesFn = (
  source: AuthSource,
  additionalData?: Partial<UserAdditionalData>
) => RegistrationFiles | Promise<RegistrationFiles>;

export type RegistrationFiles = Record<string, FileBuffer | null | undefined>;

export type CheckOAuth2UserFn = (
  source: AuthSource,
  userInfo: UserInfo,
  authUser: AuthUser | null
) => void | string | Error | Promise<void | string | Error>;
