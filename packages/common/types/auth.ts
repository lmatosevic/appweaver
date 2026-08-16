import { ResourceId } from './resource';

export type AuthUser = {
  id: ResourceId;
  email: string;
  passwordHash?: string | null;
  verifiedEmail?: boolean;
  twoFactorAuth?: 'None' | 'Email';
  enabled?: boolean;
  roles: Role[];
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
