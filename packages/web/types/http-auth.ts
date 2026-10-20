import { FastifyRequest } from 'fastify';
import { AuthScope, AuthSource, ResourceId } from '@appweaver/common';

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
