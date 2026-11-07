import { Type } from '@sinclair/typebox';
import { AuthType, ErrorCode, StringEnum } from '@appweaver/common';
import { errorResponses } from '../../errors';
import {
  authErrorCodes,
  authSchema,
  captchaErrorCodes,
  captchaHeaderSchema
} from '../auth-schema';
import { createSchemaModel } from '@appweaver/core';
import { VerificationType } from './account-service';

export const AccountSendEmailVerificationRequest = Type.Object(
  {
    redirectToUrl: Type.String({
      format: 'uri',
      description:
        'A URL to redirect to with token or status code after email verification is completed',
      example: 'https://example.com/account'
    }),
    verificationType: Type.Optional(
      StringEnum(VerificationType, {
        description:
          'auto (default) - token is verified automatically before redirecting to provided URL with a status message, ' +
          'manual - client must manually verify received token on provided URL',
        example: 'auto'
      })
    )
  },
  { $id: 'AccountSendEmailVerificationRequest' }
);

export const AccountEmailVerificationRequest = Type.Object(
  {
    token: Type.String({
      description: 'Verification token sent to the user email',
      example: 'aBcDeFgHijkLMnO123456789'
    })
  },
  { $id: 'AccountEmailVerificationRequest' }
);

export const AccountSendResetPasswordRequest = Type.Object(
  {
    redirectToUrl: Type.String({
      format: 'uri',
      description:
        'A URL to redirect to where the user will perform the password reset' +
        ' with one-time-token in the request',
      example: 'https://example.com/reset-password'
    }),
    email: Type.String({
      format: 'email',
      description: 'A email address for which to perform password reset',
      example: 'account@example.com'
    })
  },
  { $id: 'AccountSendResetPasswordRequest' }
);

export const AccountResetPasswordRequest = Type.Object(
  {
    token: Type.String({
      description: 'Password reset token sent to the user email',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    newPassword: Type.String({
      description: 'The new password to set for this user',
      example: 'yourNewPassword123'
    })
  },
  { $id: 'AccountResetPasswordRequest' }
);

export const AccountSendPhoneVerificationRequest = Type.Object(
  {
    phoneNumber: Type.Optional(
      Type.String({
        pattern: '^\\+[1-9]\\d{6,14}$',
        description:
          'The phone number to verify, in the E.164 format. Defaults to the phone number of the user',
        example: '+385911234567'
      })
    )
  },
  { $id: 'AccountSendPhoneVerificationRequest' }
);

export const AccountChallengeResponse = Type.Object(
  {
    challengeId: Type.String({
      description: 'The ID of the challenge, sent with its code',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    expiresIn: Type.Integer({
      description: 'The expiration time of the challenge in milliseconds',
      example: 600000
    })
  },
  { $id: 'AccountChallengeResponse' }
);

export const AccountVerifyPhoneRequest = Type.Object(
  {
    challengeId: Type.String({
      description: 'The ID received on sending the phone verification code',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    code: Type.String({
      description: 'The code received by SMS',
      example: '123456'
    })
  },
  { $id: 'AccountVerifyPhoneRequest' }
);

export const AccountStatusResponse = Type.Object(
  {
    message: Type.String({ example: 'Operation finished successfully' })
  },
  { $id: 'AccountStatusResponse' }
);

export const sendEmailVerificationSchema = {
  tags: ['Account'],
  security: authSchema(),
  summary: 'Send verification email',
  description: 'Send verification email',
  response: {
    200: createSchemaModel(AccountStatusResponse),
    ...errorResponses(
      ...authErrorCodes(),
      ErrorCode.AccountFeatureUnavailable,
      ErrorCode.AccountEmailAlreadyVerified,
      ErrorCode.AuthInvalidRedirectUrl,
      ErrorCode.QueueUnavailable,
      ErrorCode.MemoryUnavailable
    )
  },
  body: createSchemaModel(AccountSendEmailVerificationRequest)
};

export const verifyEmailSchema = {
  tags: ['Account'],
  summary: 'Verify email token',
  description: 'Verify email token',
  response: {
    200: createSchemaModel(AccountStatusResponse),
    ...errorResponses(
      ErrorCode.AuthInvalidToken,
      ErrorCode.AuthUserNotFound,
      ErrorCode.AccountEmailAlreadyVerified
    )
  },
  body: createSchemaModel(AccountEmailVerificationRequest)
};

export const verifyEmailRedirectSchema = {
  tags: ['Account'],
  summary:
    'Verify email token and redirect to a provided URL with status message',
  description:
    'Verify email token and redirect to a provided URL with status message',
  querystring: AccountEmailVerificationRequest,
  response: {
    302: {
      description: `Redirect to URL provided in the request for sending verification email`
    },
    ...errorResponses(
      ErrorCode.AuthInvalidToken,
      ErrorCode.AuthUserNotFound,
      ErrorCode.AccountEmailAlreadyVerified
    )
  }
};

export const sendResetPasswordSchema = {
  tags: ['Account'],
  headers: captchaHeaderSchema({
    recaptchaAction: 'send-reset-password',
    turnstileAction: 'send-reset-password'
  }),
  summary: 'Send password reset link to provided email address',
  description: 'Send password reset link to provided email address',
  response: {
    200: createSchemaModel(AccountStatusResponse),
    ...errorResponses(
      ...captchaErrorCodes({
        recaptchaAction: 'send-reset-password',
        turnstileAction: 'send-reset-password'
      }),
      ErrorCode.AccountFeatureUnavailable,
      ErrorCode.AuthInvalidRedirectUrl,
      ErrorCode.QueueUnavailable,
      ErrorCode.MemoryUnavailable
    )
  },
  body: createSchemaModel(AccountSendResetPasswordRequest)
};

export const resetPasswordSchema = {
  tags: ['Account'],
  headers: captchaHeaderSchema({
    recaptchaAction: 'reset-password',
    turnstileAction: 'reset-password'
  }),
  summary: 'Reset the user password to a new value',
  description: 'Reset the user password to a new value',
  response: {
    200: createSchemaModel(AccountStatusResponse),
    ...errorResponses(
      ...captchaErrorCodes({
        recaptchaAction: 'reset-password',
        turnstileAction: 'reset-password'
      }),
      ErrorCode.AuthInvalidToken,
      ErrorCode.AuthUserNotFound,
      ErrorCode.AuthPasswordWeak,
      ErrorCode.AccountPasswordNotSet
    )
  },
  body: createSchemaModel(AccountResetPasswordRequest)
};

export const sendPhoneVerificationSchema = {
  tags: ['Account'],
  security: authSchema([AuthType.Jwt]),
  summary: 'Send a verification code to a phone number by SMS',
  description: 'Send a verification code to a phone number by SMS',
  response: {
    200: createSchemaModel(AccountChallengeResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.AccountFeatureUnavailable,
      ErrorCode.AccountPhoneAlreadyVerified,
      ErrorCode.AccountPhoneNotSet,
      ErrorCode.SmsSendFailed,
      ErrorCode.MemoryUnavailable
    )
  },
  body: createSchemaModel(AccountSendPhoneVerificationRequest)
};

export const verifyPhoneSchema = {
  tags: ['Account'],
  security: authSchema([AuthType.Jwt]),
  summary: 'Verify the phone number with the code received by SMS',
  description: 'Verify the phone number with the code received by SMS',
  response: {
    200: createSchemaModel(AccountStatusResponse),
    ...errorResponses(
      ...authErrorCodes([AuthType.Jwt]),
      ErrorCode.AuthInvalidToken,
      ErrorCode.Account2FACodeInvalid,
      ErrorCode.Account2FATooManyAttempts,
      ErrorCode.MemoryUnavailable
    )
  },
  body: createSchemaModel(AccountVerifyPhoneRequest)
};
