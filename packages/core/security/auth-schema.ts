import { Type } from '@sinclair/typebox';
import { AuthType } from '@appweaver/common';
import { authSchema } from './helper';
import { AllErrorResponses } from '../errors';
import { RouteSchema } from '../types';

export const LoginRequest = Type.Object({
  username: Type.String({ examples: ['john.doe@example.com'] }),
  password: Type.String({ examples: ['yourPassword123!'] })
});

export const AuthResponse = Type.Object({
  accessToken: Type.String({
    example: ['eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJuYk92']
  }),
  refreshToken: Type.String({
    example: ['eyJhbGciOiJIUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJkNTBl']
  }),
  expiresIn: Type.Number({ examples: [2592000] }),
  refreshExpiresIn: Type.Number({ examples: [5184000] })
});

export const ChangePasswordRequest = Type.Object({
  currentPassword: Type.String({ examples: ['yourPassword123!'] }),
  newPassword: Type.String({
    minLength: 8,
    maxLength: 255,
    examples: ['yourNewPassword123!']
  })
});

export const LogoutResponse = Type.Object({
  success: Type.Boolean({ examples: [true] })
});

export const ExchangeRequest = Type.Object({
  token: Type.String({ examples: ['abcdefg1234567'] })
});

export const loginSchema = {
  tags: ['Auth'],
  summary: 'Login identity',
  description: 'Login identity',
  response: {
    200: AuthResponse,
    ...AllErrorResponses
  },
  body: LoginRequest
};

export const refreshSchema = {
  tags: ['Auth'],
  security: [{ bearer: [] }],
  summary: 'Refresh identity token',
  description: 'Refresh identity token',
  response: {
    200: AuthResponse,
    ...AllErrorResponses
  }
};

export const logoutSchema = {
  tags: ['Auth'],
  security: [{ bearer: [] }],
  summary: 'Logout identity',
  description: 'Logout identity',
  response: {
    200: LogoutResponse,
    ...AllErrorResponses
  }
};

export const changePasswordSchema = {
  tags: ['Auth'],
  security: authSchema([AuthType.JWT, AuthType.Basic]),
  summary: 'Change identity password',
  description: 'Change identity password',
  response: {
    200: AuthResponse,
    ...AllErrorResponses
  },
  body: ChangePasswordRequest
};

export const exchangeTokenSchema = {
  tags: ['Auth'],
  summary: 'Exchange one time token for access token',
  description: 'Exchange one time token for access token',
  response: {
    200: AuthResponse,
    ...AllErrorResponses
  },
  body: ExchangeRequest
};

export function createCurrentAuthUserSchema(modelName: string): RouteSchema {
  return {
    tags: ['Auth'],
    security: authSchema([AuthType.JWT, AuthType.Basic]),
    summary: 'Return currently authorized identity',
    description: 'Return currently authorized identity',
    response: {
      200: Type.Ref(`${modelName}Single`),
      ...AllErrorResponses
    }
  };
}

export function createOAuth2RedirectSchema(providerName: string): RouteSchema {
  return {
    tags: ['Auth'],
    summary: `Redirect to ${providerName} authentication page`,
    description: `Redirect to ${providerName} authentication page`,
    querystring: Type.Object({
      returnToUrl: Type.String({
        format: 'uri',
        description:
          'A URL to redirect to with set cookies or with one-time-token after ' +
          'successful authentication. The client then needs to exchange this ' +
          'token for an access token.'
      }),
      useCookies: Type.Optional(
        Type.Boolean({
          description:
            'Set "access_token" and "refresh_token" cookies when redirecting ' +
            'to the provided URL on successful authentication.'
        })
      )
    }),
    response: {
      301: {
        description: `Redirect to ${providerName} authentication page`
      }
    }
  };
}

export function createOAuth2CallbackSchema(providerName: string): RouteSchema {
  return {
    tags: ['Auth'],
    summary: `Authenticate identity from ${providerName} callback`,
    description: `Authenticate identity from ${providerName} callback`,
    response: {
      200: {
        description: `OK`
      },
      ...AllErrorResponses
    }
  };
}
