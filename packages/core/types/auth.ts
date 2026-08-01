import { AuthScope, AuthSource, AuthUser } from '@appweaver/common';

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

export type UserInfo = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
};

export type AvatarFile = {
  name: string;
  mimeType: string;
  size: number;
  data: Buffer;
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

export type CheckOAuth2UserFn = (
  source: AuthSource,
  userInfo: UserInfo,
  authUser: AuthUser | null
) => void | string | Error | Promise<void | string | Error>;
