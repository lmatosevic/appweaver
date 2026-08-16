import { FastifyRequest } from 'fastify';
import { AuthScope, AuthSource, AuthUser, ResourceId } from '@appweaver/common';
import { FileBuffer } from './storage';

export type JwtPayload = {
  scope: AuthScope;
  source: AuthSource;
  username: string;
  sub: ResourceId;
  iat: number;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

export type AuthOTTData = {
  authUserId: ResourceId;
  authSource: AuthSource;
  providerAccountId?: string;
  scope?: string;
  passwordRequired?: boolean;
};

export type TwoFactorAuthData = {
  authUserId: ResourceId;
  codeHash: string;
  purpose: string;
};

export type OAuth2StateData = {
  redirectToUrl: string;
};

export type AvatarFile = FileBuffer & {
  size: number;
};

export type UserInfo = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  avatarFile?: AvatarFile;
};

export type OAuth2TokenSet = {
  access_token: string;
  token_type?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  [key: string]: unknown;
};

export type OAuth2UserInfoContext = {
  token: OAuth2TokenSet;
  request: FastifyRequest;
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

export type RegistrationFilesFn = (
  source: AuthSource,
  additionalData?: Partial<UserAdditionalData>
) => RegistrationFiles | Promise<RegistrationFiles>;

export type RegistrationFiles = Record<string, FileBuffer | null | undefined>;

export type CheckOAuth2UserFn = (
  source: AuthSource,
  userInfo: UserInfo,
  authUser: AuthUser | null
) => void | string | Error | Promise<void | string | Error>;
