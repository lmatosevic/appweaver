import { FastifyRequest } from 'fastify';
import {
  AuthScope,
  AuthSource,
  ResourceId,
  TwoFactorChallengeMethod,
  TwoFactorMethodType
} from '@appweaver/common';

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
  /** The 2FA methods the user verifies with, the first being the default, set on the tokens of the `2fa` scope. */
  twoFactorMethods?: `${TwoFactorMethodType}`[];
};

export type AuthOTTData = {
  authUserId: ResourceId;
  authSource: AuthSource;
  providerAccountId?: string;
  scope?: string;
  passwordRequired?: boolean;
  /** Set on the token issued by a passed 2FA challenge, so its exchange is not challenged again. */
  twoFactorVerified?: boolean;
};

/** The data of a one-time token challenging a user for a code, counting the wrong ones. */
export type CodeChallengeData = {
  authUserId: ResourceId;
  /** The hash of the code sent by email or SMS, missing for a code of an authenticator app or a recovery code. */
  codeHash?: string;
  /** The wrong codes entered so far. */
  attempts?: number;
};

export type TwoFactorChallengeData = CodeChallengeData & {
  method: TwoFactorChallengeMethod;
  /** The purpose of the one-time token issued when the challenge is passed. */
  purpose: string;
  /** The source the user signed in with, kept by the tokens exchanged after the challenge. */
  authSource: AuthSource;
};

export type PhoneVerificationData = CodeChallengeData & {
  phoneNumber: string;
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
