import { TObject, Type } from '@sinclair/typebox';
import { AuthType, config, RecaptchaConfig } from '@appweaver/common';
import { AllErrorResponses } from '../errors';
import { RouteSchema } from '../types';

export const LoginRequest = Type.Object({
  username: Type.String({ examples: ['john.doe@example.com'] }),
  password: Type.String({ examples: ['yourPassword123!'] })
});

export const AuthTokensResponse = Type.Object({
  accessToken: Type.String({
    examples: ['eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJuYk92']
  }),
  refreshToken: Type.String({
    examples: ['eyJhbGciOiJIUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJkNTBl']
  }),
  expiresIn: Type.Number({ examples: [2592000] }),
  refreshExpiresIn: Type.Number({ examples: [5184000] })
});

export const ChangePasswordRequest = Type.Object({
  currentPassword: Type.String({ examples: ['yourPassword123!'] }),
  newPassword: Type.String({
    examples: ['yourNewPassword123!']
  })
});

export const LogoutResponse = Type.Object({
  success: Type.Boolean({ examples: [true] })
});

export const ExchangeRequest = Type.Object({
  token: Type.String({ examples: ['aBcDeFgHijkLMnO123456789'] })
});

export const loginSchema = {
  tags: ['Auth'],
  summary: 'Login identity',
  description: 'Login identity',
  response: {
    200: AuthTokensResponse,
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
    200: AuthTokensResponse,
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
  security: authSchema(),
  summary: 'Change identity password',
  description: 'Change identity password',
  response: {
    200: AuthTokensResponse,
    ...AllErrorResponses
  },
  body: ChangePasswordRequest
};

export const exchangeTokenSchema = {
  tags: ['Auth'],
  summary: 'Exchange one time token for access token',
  description: 'Exchange one time token for access token',
  response: {
    200: AuthTokensResponse,
    ...AllErrorResponses
  },
  body: ExchangeRequest
};

export function authSchema(authTypes?: AuthType[]): any[] {
  const authSchemas: any[] = [];

  for (const authType of authTypes ?? Object.values(AuthType)) {
    switch (authType) {
      case AuthType.Basic:
        if (config.SECURITY_BASIC_ENABLED) {
          authSchemas.push({ basicAuth: [] });
        }
        break;
      case AuthType.ApiKey:
        if (config.SECURITY_API_KEY_ENABLED) {
          authSchemas.push({ apiKeyAuth: [] });
        }
        break;
      case AuthType.Jwt:
        authSchemas.push({ bearer: [] });
        break;
    }
  }

  return authSchemas;
}

export function recaptchaHeaderSchema(
  recaptchaConfig: RecaptchaConfig
): TObject {
  return Type.Object(
    config.SECURITY_RECAPTCHA_ENABLED &&
      (recaptchaConfig.recaptcha || recaptchaConfig.recaptchaAction)
      ? {
          [config.SECURITY_RECAPTCHA_HEADER_NAME.toLowerCase()]: Type.String({
            minLength: 1,
            description: `reCAPTCHA token for ${recaptchaConfig.recaptchaAction ?? 'any'} action`
          })
        }
      : {},
    { additionalProperties: true }
  );
}

export function createCurrentAuthUserSchema(modelRef: string): RouteSchema {
  return {
    tags: ['Auth'],
    security: authSchema(),
    summary: 'Return currently authorized identity',
    description: 'Return currently authorized identity',
    response: {
      200: Type.Ref(modelRef),
      ...AllErrorResponses
    }
  };
}
