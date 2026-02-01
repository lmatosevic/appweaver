import { Role } from './role';

export type Identity = {
  id: number;
  username: string;
  passwordHash?: string | null;
  enabled: boolean;
  roles: Role[];
  logoutAt?: Date | null;
  updatedAt: Date;
  createdAt: Date;
  createdById?: number | null;
};
