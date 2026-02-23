import { Type } from '@sinclair/typebox';
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
  security: [{ bearer: [] }],
  summary: 'Change identity password',
  description: 'Change identity password',
  response: {
    200: AuthResponse,
    ...AllErrorResponses
  },
  body: ChangePasswordRequest
};

export function createCurrentAuthUserSchema(modelName: string): RouteSchema {
  return {
    tags: ['Auth'],
    security: [{ bearer: [] }],
    summary: 'Return currently authorized user',
    description: 'Return currently authorized user',
    response: {
      200: Type.Ref(`${modelName}Single`),
      ...AllErrorResponses
    }
  };
}
