import { AuthSource } from '@appweaver/common';
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

export type OAuth2State = {
  redirectToUrl: string;
  useCookies?: boolean;
};

export type AuthUser = {
  id: number;
  email: string;
  passwordHash?: string | null;
  verifiedEmail?: boolean;
  enabled?: boolean;
  roles: Role[];
  logoutAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  createdById?: number | null;
};

export type UserAdditionalData = {
  firstName: string;
  lastName: string;
};

export type RegistrationDataFn<T = any> = (
  source: AuthSource,
  email: string,
  password?: string,
  additionalData?: Partial<UserAdditionalData>
) => T | Promise<T>;
