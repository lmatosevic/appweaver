import { Type } from '@sinclair/typebox';
import {
  AuthType,
  ErrorCode,
  StringEnum,
  TwoFactorMethodType
} from '@appweaver/common';
import { createSchemaModel } from '@appweaver/core';
import { errorResponses } from '../../errors';
import { authErrorCodes, authSchema } from '../auth-schema';

const TwoFactorMethodSchema = StringEnum(TwoFactorMethodType, {
  description: 'A 2FA method: email or SMS codes, or an authenticator app',
  example: 'totp'
});

const TwoFactorChallengeMethodSchema = StringEnum(
  { ...TwoFactorMethodType, Recovery: 'recovery' },
  {
    description:
      'A 2FA method of the user, or `recovery` for one of their recovery codes',
    example: 'totp'
  }
);

const TwoFactorMethodListSchema = (description: string) =>
  Type.Array(TwoFactorMethodSchema, {
    description,
    example: ['totp', 'email']
  });

export const TwoFactorChallengeRequest = Type.Object(
  {
    method: Type.Optional(TwoFactorChallengeMethodSchema),
    purpose: Type.Optional(
      Type.String({
        description:
          'The purpose of the one-time token issued when the challenge is passed, `authentication` (the default) for ' +
          '`/exchange-token`',
        example: 'authentication'
      })
    )
  },
  { $id: 'TwoFactorChallengeRequest' }
);

export const TwoFactorChallengeResponse = Type.Object(
  {
    challengeId: Type.String({
      description: 'The ID of the challenge, sent with its code',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    expiresIn: Type.Integer({
      description: 'The expiration time of the challenge in milliseconds',
      example: 300000
    }),
    method: TwoFactorChallengeMethodSchema,
    destination: Type.Union([Type.String(), Type.Null()], {
      description:
        'The masked email address or phone number the code was sent to, null for an authenticator app',
      example: '+385*******67'
    }),
    methods: TwoFactorMethodListSchema(
      'The methods of the user, the first being the default'
    )
  },
  { $id: 'TwoFactorChallengeResponse' }
);

export const TwoFactorVerifyRequest = Type.Object(
  {
    challengeId: Type.String({
      description: 'The ID received on sending the challenge',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    code: Type.String({
      description: 'The code sent by email or SMS, or of the authenticator app',
      example: '123456'
    })
  },
  { $id: 'TwoFactorVerifyRequest' }
);

export const TwoFactorVerifyResponse = Type.Object(
  {
    token: Type.String({
      description:
        'The one-time token of the requested purpose, exchanged with `/exchange-token` for `authentication`',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    expiresIn: Type.Integer({
      description: 'The expiration time of the one-time token in milliseconds',
      example: 120000
    })
  },
  { $id: 'TwoFactorVerifyResponse' }
);

export const TwoFactorMethodsResponse = Type.Object(
  {
    enabled: TwoFactorMethodListSchema(
      'The enabled methods of the user, the first being the default'
    ),
    available: TwoFactorMethodListSchema('The methods the user may enable')
  },
  { $id: 'TwoFactorMethodsResponse' }
);

export const TwoFactorEnableMethodRequest = Type.Object(
  {
    method: StringEnum(
      { Email: TwoFactorMethodType.Email, Sms: TwoFactorMethodType.Sms },
      {
        description:
          'The email or SMS method, the authenticator app is enabled by its setup',
        example: 'sms'
      }
    )
  },
  { $id: 'TwoFactorEnableMethodRequest' }
);

export const TwoFactorOrderMethodsRequest = Type.Object(
  {
    methods: TwoFactorMethodListSchema(
      'Every enabled method of the user in the new order, the first becoming the default'
    )
  },
  { $id: 'TwoFactorOrderMethodsRequest' }
);

export const TwoFactorDisableMethodParams = Type.Object(
  { method: TwoFactorMethodSchema },
  { $id: 'TwoFactorDisableMethodParams' }
);

export const TwoFactorDisableMethodRequest = Type.Object(
  {
    password: Type.Optional(
      Type.String({
        description: 'The password of the user, required when the user has one',
        example: 'yourPassword123!'
      })
    )
  },
  { $id: 'TwoFactorDisableMethodRequest' }
);

export const TwoFactorTotpSetupResponse = Type.Object(
  {
    secret: Type.String({
      description:
        'The secret in Base32, for entering it in an authenticator app by hand',
      example: 'JBSWY3DPEHPK3PXP'
    }),
    otpauthUrl: Type.String({
      description: 'The otpauth:// URI of the secret, for a QR code',
      example:
        'otpauth://totp/Appweaver:jane%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Appweaver'
    }),
    expiresIn: Type.Integer({
      description:
        'The time to confirm the setup with a first code in milliseconds',
      example: 600000
    })
  },
  { $id: 'TwoFactorTotpSetupResponse' }
);

export const TwoFactorTotpConfirmRequest = Type.Object(
  {
    code: Type.String({
      description: 'A code of the authenticator app',
      example: '123456'
    })
  },
  { $id: 'TwoFactorTotpConfirmRequest' }
);

const TwoFactorMethodsChangeResponse = TwoFactorMethodsResponse;

export const TwoFactorRecoveryCodesRequest = Type.Object(
  {
    password: Type.Optional(
      Type.String({
        description: 'The password of the user, required when the user has one',
        example: 'yourPassword123!'
      })
    )
  },
  { $id: 'TwoFactorRecoveryCodesRequest' }
);

export const TwoFactorRecoveryCodesResponse = Type.Object(
  {
    codes: Type.Array(Type.String(), {
      description:
        'The recovery codes, shown only once, each used once instead of a 2FA code',
      example: ['7G2K-QX9M-4TZB-8HRW', 'M3NP-2VXC-9KQT-6JZD']
    }),
    generatedAt: Type.String({
      format: 'date-time',
      example: '2026-11-01T12:00:00.000Z'
    })
  },
  { $id: 'TwoFactorRecoveryCodesResponse' }
);

const jwtSecurity = {
  tags: ['Two-factor authentication'],
  security: authSchema([AuthType.Jwt])
};

export const twoFactorChallengeSchema = {
  ...jwtSecurity,
  summary: 'Send a 2FA challenge to the signed-in user',
  description:
    'Send a 2FA code by the requested method, or the default one of the user, or wait for the code of the ' +
    'authenticator app',
  response: {
    200: createSchemaModel(TwoFactorChallengeResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.ValidationFailed,
      ErrorCode.Account2FAMethodUnavailable,
      ErrorCode.Account2FAMethodNotEnabled,
      ErrorCode.AccountPhoneNotVerified,
      ErrorCode.AccountFeatureUnavailable,
      ErrorCode.SmsSendFailed,
      ErrorCode.QueueUnavailable,
      ErrorCode.MemoryUnavailable
    )
  },
  body: createSchemaModel(TwoFactorChallengeRequest)
};

export const twoFactorVerifySchema = {
  ...jwtSecurity,
  summary: 'Verify the code of a 2FA challenge',
  description:
    'Verify the code of a 2FA challenge, returning the one-time token of its purpose',
  response: {
    200: createSchemaModel(TwoFactorVerifyResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.AuthInvalidToken,
      ErrorCode.Account2FACodeInvalid,
      ErrorCode.Account2FATooManyAttempts,
      ErrorCode.MemoryUnavailable
    )
  },
  body: createSchemaModel(TwoFactorVerifyRequest)
};

export const twoFactorMethodsSchema = {
  ...jwtSecurity,
  summary: 'List the 2FA methods of the signed-in user',
  description:
    'List the enabled 2FA methods of the signed-in user, and the ones they may enable',
  response: {
    200: createSchemaModel(TwoFactorMethodsResponse),
    ...errorResponses(...authErrorCodes([AuthType.Jwt]))
  }
};

export const twoFactorEnableMethodSchema = {
  ...jwtSecurity,
  summary: 'Enable the email or SMS 2FA method',
  description:
    'Enable the email or SMS 2FA method of the signed-in user, which needs a verified email address or phone number',
  response: {
    200: createSchemaModel(TwoFactorMethodsChangeResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.Account2FAMethodUnavailable,
      ErrorCode.Account2FAMethodAlreadyEnabled,
      ErrorCode.AccountEmailNotVerified,
      ErrorCode.AccountPhoneNotVerified,
      ErrorCode.AccountFeatureUnavailable
    )
  },
  body: createSchemaModel(TwoFactorEnableMethodRequest)
};

export const twoFactorOrderMethodsSchema = {
  ...jwtSecurity,
  summary: 'Order the 2FA methods',
  description:
    'Order the 2FA methods of the signed-in user, the first becoming the default',
  response: {
    200: createSchemaModel(TwoFactorMethodsChangeResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.Account2FAMethodNotEnabled,
      ErrorCode.AccountFeatureUnavailable
    )
  },
  body: createSchemaModel(TwoFactorOrderMethodsRequest)
};

export const twoFactorDisableMethodSchema = {
  ...jwtSecurity,
  summary: 'Disable a 2FA method',
  description:
    'Disable a 2FA method of the signed-in user, confirmed by the password of a user who has one',
  params: TwoFactorDisableMethodParams,
  response: {
    200: createSchemaModel(TwoFactorMethodsChangeResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.AuthPasswordRequired,
      ErrorCode.AuthInvalidCredentials,
      ErrorCode.Account2FAMethodNotEnabled,
      ErrorCode.AccountFeatureUnavailable
    )
  },
  body: createSchemaModel(TwoFactorDisableMethodRequest)
};

export const twoFactorTotpSetupSchema = {
  ...jwtSecurity,
  summary: 'Start the setup of an authenticator app',
  description:
    'Generate the TOTP secret of the signed-in user, enabled once a first code confirms it',
  response: {
    200: createSchemaModel(TwoFactorTotpSetupResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.Account2FAMethodUnavailable,
      ErrorCode.Account2FAMethodAlreadyEnabled,
      ErrorCode.AccountFeatureUnavailable
    )
  }
};

export const twoFactorTotpConfirmSchema = {
  ...jwtSecurity,
  summary: 'Confirm the setup of an authenticator app',
  description:
    'Confirm the TOTP setup of the signed-in user with a code of the authenticator app, enabling the method',
  response: {
    200: createSchemaModel(TwoFactorMethodsChangeResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.AuthInvalidToken,
      ErrorCode.Account2FAMethodUnavailable,
      ErrorCode.Account2FAMethodAlreadyEnabled,
      ErrorCode.Account2FACodeInvalid,
      ErrorCode.AccountFeatureUnavailable
    )
  },
  body: createSchemaModel(TwoFactorTotpConfirmRequest)
};

export const twoFactorRecoveryCodesSchema = {
  ...jwtSecurity,
  summary: 'Generate the recovery codes',
  description:
    'Generate the recovery codes of the signed-in user, replacing the ones they had, confirmed by the password of a ' +
    'user who has one',
  response: {
    200: createSchemaModel(TwoFactorRecoveryCodesResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.AuthPasswordRequired,
      ErrorCode.AuthInvalidCredentials,
      ErrorCode.Account2FAMethodUnavailable,
      ErrorCode.Account2FAMethodNotEnabled
    )
  },
  body: createSchemaModel(TwoFactorRecoveryCodesRequest)
};
