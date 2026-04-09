import { AuthScope, AuthSource } from '@appweaver/common';

export type JwtPayload = {
  scope: AuthScope;
  source: AuthSource;
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

export type AuthOTTData = {
  authUserId: number;
  authSource: AuthSource;
};

export type TwoFactorAuthData = {
  authUserId: number;
  codeHash: string;
  purpose: string;
};

export type OAuth2StateData = {
  redirectToUrl: string;
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
