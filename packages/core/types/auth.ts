import { Role } from './generated';

export type JwtPayload = {
  username: string;
  sub: number;
  iat: number;
  refresh?: boolean;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

export type AuthUser = {
  id: number;
  email: string;
  enabled: boolean;
  passwordHash?: string | null;
  roles: Role[];
  logoutAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  createdById?: number | null;
};
