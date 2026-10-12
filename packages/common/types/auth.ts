import { ResourceId } from './resource-id';

export type AuthUser = {
  id: ResourceId;
  email: string;
  roles: Role[];
  passwordHash?: string | null;
  verifiedEmail?: boolean;
  twoFactorAuth?: 'None' | 'Email';
  enabled?: boolean;
  logoutAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  createdById?: ResourceId | null;
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
