import { Type } from '@sinclair/typebox';
import { AuthType, StringEnum } from '@appweaver/common';
import { AllErrorResponses } from '../../errors';
import { authSchema, recaptchaHeaderSchema } from '../auth-schema';
import { createSchemaModel } from '../../utils';
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

export const AccountSend2FACodeRequest = Type.Object(
  {
    purpose: Type.Optional(
      Type.String({
        description: 'A purpose for using two-factor authentication method',
        example: 'authentication'
      })
    )
  },
  { $id: 'AccountSend2FACodeRequest' }
);

export const AccountSend2FAResponse = Type.Object(
  {
    challengeId: Type.String({
      description: 'The ID for currently requested 2FA',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    expiresIn: Type.Integer({
      description: 'The expiration time in milliseconds for the 2FA challenge',
      example: 300000
    })
  },
  { $id: 'AccountSend2FAResponse' }
);

export const AccountVerify2FARequest = Type.Object(
  {
    challengeId: Type.String({
      description: 'The ID value received on sending 2FA code request',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    code: Type.String({
      description: 'The 2FA code to verify',
      example: '123456'
    })
  },
  { $id: 'AccountVerify2FARequest' }
);

export const AccountVerify2FAResponse = Type.Object(
  {
    token: Type.String({
      description:
        'The one-time-token for requested purpose (e.g., authentication)',
      example: 'aBcDeFgHijkLMnO123456789'
    }),
    expiresIn: Type.Integer({
      description:
        'The expiration time in milliseconds for the 2FA authentication token',
      example: 120000
    })
  },
  { $id: 'AccountVerify2FAResponse' }
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
    ...AllErrorResponses
  },
  body: createSchemaModel(AccountSendEmailVerificationRequest)
};

export const verifyEmailSchema = {
  tags: ['Account'],
  summary: 'Verify email token',
  description: 'Verify email token',
  response: {
    200: createSchemaModel(AccountStatusResponse),
    ...AllErrorResponses
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
    ...AllErrorResponses
  }
};

export const sendResetPasswordSchema = {
  tags: ['Account'],
  header: recaptchaHeaderSchema({ recaptchaAction: 'send-reset-password' }),
  summary: 'Send password reset link to provided email address',
  description: 'Send password reset link to provided email address',
  response: {
    200: createSchemaModel(AccountStatusResponse),
    ...AllErrorResponses
  },
  body: createSchemaModel(AccountSendResetPasswordRequest)
};

export const resetPasswordSchema = {
  tags: ['Account'],
  header: recaptchaHeaderSchema({ recaptchaAction: 'reset-password' }),
  summary: 'Reset the user password to a new value',
  description: 'Reset the user password to a new value',
  response: {
    200: createSchemaModel(AccountStatusResponse),
    ...AllErrorResponses
  },
  body: createSchemaModel(AccountResetPasswordRequest)
};

export const send2FACodeSchema = {
  tags: ['Account'],
  security: authSchema([AuthType.Jwt]),
  summary: 'Send 2FA code for currently logged-in user',
  description: 'Send 2FA code for currently logged-in user',
  response: {
    200: createSchemaModel(AccountSend2FAResponse),
    ...AllErrorResponses
  },
  body: createSchemaModel(AccountSend2FACodeRequest)
};

export const verify2FACodeSchema = {
  tags: ['Account'],
  security: authSchema([AuthType.Jwt]),
  summary: 'Verify 2FA code for currently logged-in user',
  description: 'Verify 2FA code for currently logged-in user',
  response: {
    200: createSchemaModel(AccountVerify2FAResponse),
    ...AllErrorResponses
  },
  body: createSchemaModel(AccountVerify2FARequest)
};
