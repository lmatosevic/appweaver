import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AuthType,
  config,
  ErrorCode,
  RecaptchaConfig,
  RouteSchema
} from '@appweaver/common';
import { errorResponses } from '../errors';
import { createSchemaModel } from '../utils';

export const LoginRequest = Type.Object(
  {
    username: Type.String({ example: 'john.doe@example.com' }),
    password: Type.String({ example: 'yourPassword123!' })
  },
  { $id: 'LoginRequest' }
);

export const AuthenticationResponse = Type.Object(
  {
    accessToken: Type.String({
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJuYk92'
    }),
    refreshToken: Type.String({
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJkNTBl'
    }),
    expiresIn: Type.Number({ example: 604800 }),
    refreshExpiresIn: Type.Number({ example: 5184000 })
  },
  { $id: 'AuthenticationResponse' }
);

export const ChangePasswordRequest = Type.Object(
  {
    currentPassword: Type.String({ example: 'oldPassword123!' }),
    newPassword: Type.String({ example: 'newPassword321!' })
  },
  { $id: 'ChangePasswordRequest' }
);

export const LogoutResponse = Type.Object(
  {
    success: Type.Boolean({ example: true })
  },
  { $id: 'LogoutResponse' }
);

export const ExchangeTokenRequest = Type.Object(
  {
    token: Type.String({ example: 'aBcDeFgHijkLMnO123456789' }),
    password: Type.Optional(
      Type.String({
        description:
          'Account password, required when the OAuth2 redirect returned `passwordRequired=true`',
        example: 'yourPassword123!'
      })
    )
  },
  { $id: 'ExchangeTokenRequest' }
);

export const loginSchema = {
  tags: ['Auth'],
  summary: 'Login identity',
  description: 'Login identity',
  response: {
    200: createSchemaModel(AuthenticationResponse),
    ...errorResponses(
      ErrorCode.AuthInvalidCredentials,
      ErrorCode.AuthPasswordDisabled
    )
  },
  body: createSchemaModel(LoginRequest)
};

export const refreshSchema = {
  tags: ['Auth'],
  security: [{ bearer: [] }],
  summary: 'Refresh identity token',
  description: 'Refresh identity token',
  response: {
    200: createSchemaModel(AuthenticationResponse),
    ...errorResponses(...authErrorCodes([AuthType.Jwt]))
  }
};

export const logoutSchema = {
  tags: ['Auth'],
  security: [{ bearer: [] }],
  summary: 'Logout identity',
  description: 'Logout identity',
  response: {
    200: createSchemaModel(LogoutResponse),
    ...errorResponses(...authErrorCodes([AuthType.Jwt]))
  }
};

export const changePasswordSchema = {
  tags: ['Auth'],
  security: authSchema(),
  summary: 'Change identity password',
  description: 'Change identity password',
  response: {
    200: createSchemaModel(AuthenticationResponse),
    ...errorResponses(
      ...authErrorCodes(),
      ErrorCode.AuthPasswordDisabled,
      ErrorCode.AuthPasswordInvalid,
      ErrorCode.AuthPasswordWeak
    )
  },
  body: createSchemaModel(ChangePasswordRequest)
};

export const exchangeTokenSchema = {
  tags: ['Auth'],
  summary: 'Exchange one time token for access token',
  description: 'Exchange one time token for access token',
  response: {
    200: createSchemaModel(AuthenticationResponse),
    ...errorResponses(
      ErrorCode.AuthInvalidToken,
      ErrorCode.AuthUserNotFound,
      ErrorCode.AuthPasswordRequired,
      ErrorCode.AuthInvalidCredentials,
      ErrorCode.OAuth2AccountConflict
    )
  },
  body: createSchemaModel(ExchangeTokenRequest)
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

/**
 * Returns the error codes a route authenticated with the given types can
 * respond with, none for a public route.
 *
 * @param {AuthType[]} [authTypes] The accepted authentication types, all of the
 * enabled ones by default.
 */
export function authErrorCodes(authTypes?: AuthType[]): ErrorCode[] {
  const types = (authTypes ?? Object.values(AuthType)).filter(
    (type) =>
      type === AuthType.Jwt ||
      (type === AuthType.ApiKey && config.SECURITY_API_KEY_ENABLED) ||
      (type === AuthType.Basic && config.SECURITY_BASIC_ENABLED)
  );
  if (types.length === 0) {
    return [];
  }

  const codes = [
    ErrorCode.AuthUnauthorized,
    ErrorCode.AuthInvalidHeader,
    ErrorCode.AuthForbidden
  ];
  if (types.includes(AuthType.Jwt)) {
    codes.push(
      ErrorCode.AuthInvalidToken,
      ErrorCode.AuthTokenExpired,
      ErrorCode.AuthScopeForbidden
    );
  }
  if (types.includes(AuthType.ApiKey)) {
    codes.push(
      ErrorCode.AuthApiKeyMissing,
      ErrorCode.AuthApiKeyInvalid,
      ErrorCode.AuthApiKeyExpired
    );
  }
  if (types.includes(AuthType.Basic)) {
    codes.push(
      config.SECURITY_BASIC_PROXY_MODE
        ? ErrorCode.AuthProxyAuthenticationRequired
        : ErrorCode.AuthInvalidCredentials
    );
  }
  return codes;
}

/**
 * Returns the error codes a route verifying a reCAPTCHA token can respond
 * with, none when the route verifies none.
 */
export function recaptchaErrorCodes(
  recaptchaConfig: RecaptchaConfig
): ErrorCode[] {
  return config.SECURITY_RECAPTCHA_ENABLED &&
    (recaptchaConfig.recaptcha || recaptchaConfig.recaptchaAction)
    ? [
        ErrorCode.RecaptchaMissing,
        ErrorCode.RecaptchaInvalid,
        ErrorCode.RecaptchaActionMismatch,
        ErrorCode.RecaptchaLowScore,
        ErrorCode.RecaptchaUnavailable
      ]
    : [];
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

export function createCurrentAuthUserSchema(modelSchema: TSchema): RouteSchema {
  return {
    tags: ['Auth'],
    security: authSchema(),
    summary: 'Return currently authorized identity',
    description: 'Return currently authorized identity',
    response: {
      200: modelSchema,
      ...errorResponses(...authErrorCodes())
    }
  };
}
