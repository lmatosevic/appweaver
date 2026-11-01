import { TwoFactorAuth } from '../enums';
import { ResourceId } from './resource-id';

export type AuthUser = {
  id: ResourceId;
  email: string;
  roles: Role[];
  passwordHash?: string | null;
  verifiedEmail?: boolean;
  twoFactorAuth?: `${TwoFactorAuth}`;
  enabled?: boolean;
  logoutAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  createdById?: ResourceId | null;
  /** The permissions of a user narrowed to the scope of an API key, checked instead of the ones of its roles. */
  permissions?: Permission[];
};

export type Role = {
  id: ResourceId;
  name: string;
  permissions: Array<Permission>;
  updatedAt: Date;
  createdAt: Date;
  createdById?: ResourceId | null;
};

export type Permission = {
  id: ResourceId;
  name: string;
};
