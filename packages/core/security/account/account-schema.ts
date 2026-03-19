import { Type } from '@sinclair/typebox';
import { AuthType, StringEnum } from '@appweaver/common';
import { AllErrorResponses } from '../../errors';
import { authSchema, recaptchaHeaderSchema } from '../auth-schema';
import { VerificationType } from './account-service';

export const AccountSendEmailVerificationRequest = Type.Object({
  redirectToUrl: Type.String({
    format: 'uri',
    description:
      'A URL to redirect to with token or status code after email verification is completed',
    examples: ['https://example.com/account']
  }),
  verificationType: Type.Optional(
    StringEnum(VerificationType, {
      description:
        'auto (default) - token is verified automatically before redirecting to provided URL with status message, ' +
        'manual - client must manually verify received token on provided URL',
      examples: ['auto']
    })
  )
});

export const AccountEmailVerificationRequest = Type.Object({
  token: Type.String({
    description: 'Verification token sent to the user email',
    examples: ['aBcDeFgHijkLMnO123456789']
  })
});

export const AccountSendResetPasswordRequest = Type.Object({
  redirectToUrl: Type.String({
    format: 'uri',
    description:
      'A URL to redirect to where the user will perform the password reset' +
      ' with one-time-token in the request',
    examples: ['https://example.com/reset-password']
  }),
  email: Type.String({
    format: 'email',
    description: 'A email address for which to perform password reset',
    examples: ['account@example.com']
  })
});

export const AccountResetPasswordRequest = Type.Object({
  token: Type.String({
    description: 'Password reset token sent to the user email',
    examples: ['aBcDeFgHijkLMnO123456789']
  }),
  newPassword: Type.String({
    description: 'The new password to set for this user',
    examples: ['yourNewPassword123']
  })
});

export const AccountSend2FACodeRequest = Type.Object({
  purpose: Type.Optional(
    Type.String({
      description: 'A purpose for using two factor authentication method',
      examples: ['authentication']
    })
  )
});

export const AccountSend2FAResponse = Type.Object({
  challengeId: Type.String({
    description: 'The ID for currently requested 2FA',
    examples: ['aBcDeFgHijkLMnO123456789']
  })
});

export const AccountVerify2FARequest = Type.Object({
  challengeId: Type.String({
    description: 'The ID value received on sending 2FA code request',
    examples: ['aBcDeFgHijkLMnO123456789']
  }),
  code: Type.String({
    description: 'The 2FA code to verify',
    examples: ['123456']
  })
});

export const AccountVerify2FAResponse = Type.Object({
  token: Type.String({
    description:
      'The one-time-token for requested purpose (e.g. authentication)',
    examples: ['aBcDeFgHijkLMnO123456789']
  })
});

export const AccountStatusResponse = Type.Object({
  message: Type.String({ examples: ['Operation finished successfully'] })
});

export const sendEmailVerificationSchema = {
  tags: ['Account'],
  security: authSchema(),
  summary: 'Send verification email',
  description: 'Send verification email',
  response: {
    200: AccountStatusResponse,
    ...AllErrorResponses
  },
  body: AccountSendEmailVerificationRequest
};

export const verifyEmailSchema = {
  tags: ['Account'],
  summary: 'Verify email token',
  description: 'Verify email token',
  response: {
    200: AccountStatusResponse,
    ...AllErrorResponses
  },
  body: AccountEmailVerificationRequest
};

export const verifyEmailRedirectSchema = {
  tags: ['Account'],
  summary:
    'Verify email token and redirect to a provided URL with status and message',
  description:
    'Verify email token and redirect to a provided URL with status and message',
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
    200: AccountStatusResponse,
    ...AllErrorResponses
  },
  body: AccountSendResetPasswordRequest
};

export const resetPasswordSchema = {
  tags: ['Account'],
  header: recaptchaHeaderSchema({ recaptchaAction: 'reset-password' }),
  summary: 'Reset the user password to a new value',
  description: 'Reset the user password to a new value',
  response: {
    200: AccountStatusResponse,
    ...AllErrorResponses
  },
  body: AccountResetPasswordRequest
};

export const send2FACodeSchema = {
  tags: ['Account'],
  security: authSchema([AuthType.Jwt]),
  summary: 'Send 2FA code for currently logged-in user',
  description: 'Send 2FA code for currently logged-in user',
  response: {
    200: AccountSend2FAResponse,
    ...AllErrorResponses
  },
  body: AccountSend2FACodeRequest
};

export const verify2FACodeSchema = {
  tags: ['Account'],
  security: authSchema([AuthType.Jwt]),
  summary: 'Verify 2FA code for currently logged-in user',
  description: 'Verify 2FA code for currently logged-in user',
  response: {
    200: AccountVerify2FAResponse,
    ...AllErrorResponses
  },
  body: AccountVerify2FARequest
};
