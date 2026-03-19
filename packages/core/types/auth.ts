import { AuthSource } from '@appweaver/common';
import { Role } from './generated';

export type JwtPayload = {
  scope: string;
  username: string;
  sub: number;
  iat: number;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

export type TwoFactorAuthData = {
  authUserId: number;
  codeHash: string;
  purpose: string;
};

export type OAuth2State = {
  redirectToUrl: string;
};

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

export type ValidationResult = {
  valid: boolean;
  message: string;
};
