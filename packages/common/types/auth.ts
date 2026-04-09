export type AuthUser = {
  id: number;
  email: string;
  passwordHash?: string | null;
  verifiedEmail?: boolean;
  twoFactorAuth?: 'None' | 'Email';
  enabled?: boolean;
  roles: Role[];
  logoutAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  createdById?: number | null;
};

export type Role = {
  id: number;
  name: string;
  permissions: Array<Permission>;
  updatedAt: Date;
  createdAt: Date;
  createdById?: number | null;
};

export type Permission = {
  id: number;
  name: string;
};
