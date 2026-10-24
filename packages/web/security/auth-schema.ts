import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AuthType,
  CaptchaConfig,
  ErrorCode,
  RecaptchaConfig,
  RouteSchema,
  TurnstileConfig
} from '@appweaver/common';
import {
  basicAuthConfig,
  recaptchaConfig,
  turnstileConfig
} from './security-config';
import { apiKeyConfig } from '@appweaver/data';
import { errorResponses } from '../errors';
import { createSchemaModel } from '@appweaver/core';

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

/**
 * Returns the OpenAPI security requirements of a route authenticated with the given types, skipping the disabled ones.
 *
 * @param {AuthType[]} [authTypes] - The accepted authentication types, all of them by default.
 * @return {Object[]} The security requirements of the route.
 */
export function authSchema(authTypes?: AuthType[]): any[] {
  const authSchemas: any[] = [];

  for (const authType of authTypes ?? Object.values(AuthType)) {
    switch (authType) {
      case AuthType.Basic:
        if (basicAuthConfig.ENABLED) {
          authSchemas.push({ basicAuth: [] });
        }
        break;
      case AuthType.ApiKey:
        if (apiKeyConfig.ENABLED) {
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
      (type === AuthType.ApiKey && apiKeyConfig.ENABLED) ||
      (type === AuthType.Basic && basicAuthConfig.ENABLED)
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
      basicAuthConfig.PROXY_MODE
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
export function recaptchaErrorCodes(config: RecaptchaConfig): ErrorCode[] {
  return recaptchaConfig.ENABLED && (config.recaptcha || config.recaptchaAction)
    ? [
        ErrorCode.RecaptchaMissing,
        ErrorCode.RecaptchaInvalid,
        ErrorCode.RecaptchaActionMismatch,
        ErrorCode.RecaptchaLowScore,
        ErrorCode.RecaptchaUnavailable
      ]
    : [];
}

/**
 * Returns the header schema of the reCAPTCHA token a route verifies, empty when the route verifies none.
 *
 * @param {RecaptchaConfig} config - The reCAPTCHA config of the route.
 * @return {TObject} The header schema.
 */
export function recaptchaHeaderSchema(config: RecaptchaConfig): TObject {
  return Type.Object(
    recaptchaConfig.ENABLED && (config.recaptcha || config.recaptchaAction)
      ? {
          [recaptchaConfig.HEADER_NAME.toLowerCase()]: Type.String({
            minLength: 1,
            description: `reCAPTCHA token for ${config.recaptchaAction ?? 'any'} action`
          })
        }
      : {},
    { additionalProperties: true }
  );
}

/**
 * Returns the error codes a route verifying a Cloudflare Turnstile token can
 * respond with, none when the route verifies none.
 */
export function turnstileErrorCodes(config: TurnstileConfig): ErrorCode[] {
  return turnstileConfig.ENABLED && (config.turnstile || config.turnstileAction)
    ? [
        ErrorCode.TurnstileMissing,
        ErrorCode.TurnstileInvalid,
        ErrorCode.TurnstileActionMismatch,
        ErrorCode.TurnstileUnavailable
      ]
    : [];
}

/**
 * Returns the header schema of the Cloudflare Turnstile token a route verifies, empty when the route verifies none.
 *
 * @param {TurnstileConfig} config - The Turnstile config of the route.
 * @return {TObject} The header schema.
 */
export function turnstileHeaderSchema(config: TurnstileConfig): TObject {
  return Type.Object(
    turnstileConfig.ENABLED && (config.turnstile || config.turnstileAction)
      ? {
          [turnstileConfig.HEADER_NAME.toLowerCase()]: Type.String({
            minLength: 1,
            maxLength: 2048,
            description: `Turnstile token for ${config.turnstileAction ?? 'any'} action`
          })
        }
      : {},
    { additionalProperties: true }
  );
}

/**
 * Returns the error codes of all the bot checks (reCAPTCHA and Turnstile) a
 * route verifies.
 */
export function captchaErrorCodes(captchaConfig: CaptchaConfig): ErrorCode[] {
  return [
    ...recaptchaErrorCodes(captchaConfig),
    ...turnstileErrorCodes(captchaConfig)
  ];
}

/** Returns the headers of all the bot checks (reCAPTCHA and Turnstile) a route verifies. */
export function captchaHeaderSchema(captchaConfig: CaptchaConfig): TObject {
  return Type.Object(
    {
      ...recaptchaHeaderSchema(captchaConfig).properties,
      ...turnstileHeaderSchema(captchaConfig).properties
    },
    { additionalProperties: true }
  );
}

/**
 * Builds the route schema responding with the currently authenticated identity.
 *
 * @param {TSchema} modelSchema - The response schema of the auth model.
 * @return {RouteSchema} The route schema.
 */
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
