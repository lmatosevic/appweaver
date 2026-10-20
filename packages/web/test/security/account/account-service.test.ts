jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  Object.assign(actual.configOverrides, {
    APP_HOSTNAME: 'http://api.test',
    SECURITY_ALLOWED_REDIRECT_HOSTS: ['app.test']
  });
  return actual;
});

import {
  AuthOTTPurpose,
  AuthSource,
  config,
  ErrorCode,
  makeHash,
  SecurityStore,
  TemplateEngine,
  AuthError
} from '@appweaver/common';
import {
  accountConfig,
  securityConfig,
  twoFactorConfig
} from '../../../security/security-config';
import { define, EmailService, LocaleService } from '@appweaver/core';
import { AuthService } from '../../../security/auth-service';
import {
  AccountService,
  VerificationType
} from '../../../security/account/account-service';
import { checkPassword } from '@appweaver/data';
import { resetContext } from '@appweaver/testing';
import { authUser } from '../../fixtures/server-fixture';

const STRONG_PASSWORD = 'N3w-Passw0rd!';

describe('account-service', () => {
  let authService: Record<string, jest.Mock>;
  let securityStore: Record<string, jest.Mock>;
  let sendEmail: jest.Mock;
  let sendPlainEmail: jest.Mock;
  let hasTemplate: jest.Mock;
  let tokenData: Record<string, any>;
  let service: AccountService;

  /** Creates the service with the given dependencies defined, the email service and the template engine included
   * unless told otherwise. */
  function createService(
    withEmail: boolean = true,
    withTemplates: boolean = true
  ): AccountService {
    resetContext();
    define(authService, AuthService);
    define(securityStore, SecurityStore as any);
    define(LocaleService);
    if (withEmail) {
      // Tells the template emails apart from the plain text ones
      define(
        {
          sendEmail: (email: object) =>
            'template' in email ? sendEmail(email) : sendPlainEmail(email)
        },
        EmailService
      );
    }
    if (withTemplates) {
      define({ hasTemplate }, TemplateEngine as any);
    }
    return new AccountService();
  }

  const lastEmail = () => sendEmail.mock.calls.at(-1)[0];

  beforeEach(() => {
    tokenData = { authUserId: 1, redirectToUrl: 'https://app.test/verified' };

    authService = {
      findById: jest.fn().mockResolvedValue(authUser()),
      findByUsername: jest
        .fn()
        .mockResolvedValue(authUser({ passwordHash: 'hash' })),
      updateAuthUser: jest.fn().mockResolvedValue(authUser())
    };

    securityStore = {
      generateOneTimeToken: jest.fn().mockResolvedValue('ott'),
      // Runs the content validator the way the security stores do
      useOneTimeToken: jest
        .fn()
        .mockImplementation(async (_token, _purpose, validate) => {
          const result = validate?.(tokenData);
          if (result && !result.valid) {
            throw new AuthError(ErrorCode.AuthInvalidToken, result.message);
          }
          return tokenData;
        })
    };

    sendEmail = jest.fn().mockResolvedValue(true);
    sendPlainEmail = jest.fn().mockResolvedValue(true);
    hasTemplate = jest.fn().mockResolvedValue(true);

    service = createService();
  });

  afterAll(() => {
    resetContext();
  });

  describe('sendEmailVerification', () => {
    test('emails a link to the verification redirect route', async () => {
      await expect(
        service.sendEmailVerification(authUser(), 'https://app.test/verified')
      ).resolves.toBe('Verification email sent');

      expect(securityStore.generateOneTimeToken).toHaveBeenCalledWith(
        AuthOTTPurpose.EmailVerification,
        { authUserId: 1, redirectToUrl: 'https://app.test/verified' },
        accountConfig.VERIFY_EMAIL_OTT_TTL
      );
      expect(lastEmail()).toMatchObject({
        to: 'user@test.com',
        template: 'emails/verify-email'
      });
      expect(lastEmail().data.link).toMatch(
        /http:\/\/api\.test\/auth\/account\/verify-email-redirect\?token=ott$/
      );
    });

    test('emails a link to the redirect URL with manual verification', async () => {
      await service.sendEmailVerification(
        authUser(),
        'https://app.test/verify?lang=en',
        VerificationType.Manual
      );

      expect(lastEmail().data.link).toMatch(
        /https:\/\/app\.test\/verify\?lang=en&token=ott$/
      );
    });

    test('renders the templates of the application in the given locale', async () => {
      await service.sendEmailVerification(
        authUser(),
        'https://app.test/verified',
        VerificationType.Auto,
        'de'
      );

      expect(hasTemplate).toHaveBeenCalledWith(
        'emails/verify-email.html',
        'de'
      );
      expect(lastEmail().subject).toBeUndefined();
      expect(sendPlainEmail).not.toHaveBeenCalled();
    });

    test('sends the translated subject without a subject template', async () => {
      hasTemplate.mockImplementation(
        async (name: string) => !name.endsWith('.subject')
      );

      await service.sendEmailVerification(
        authUser(),
        'https://app.test/verified'
      );

      expect(lastEmail().subject).toBe('Verify your email address');
    });

    test('sends the plain text of the translations without a template of the application', async () => {
      hasTemplate.mockResolvedValue(false);

      await service.sendEmailVerification(
        authUser(),
        'https://app.test/verified'
      );

      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendPlainEmail.mock.calls[0][0].subject).toBe(
        'Verify your email address'
      );
    });

    test('sends the plain text of the translations without the template engine', async () => {
      await createService(true, false).sendEmailVerification(
        authUser(),
        'https://app.test/verified'
      );

      const email = sendPlainEmail.mock.calls[0][0];
      expect(email.subject).toBe('Verify your email address');
      expect(email.text).toContain(
        'http://api.test/auth/account/verify-email-redirect?token=ott'
      );
    });

    test('rejects a user whose email is already verified', async () => {
      await expect(
        service.sendEmailVerification(
          authUser({ verifiedEmail: true }),
          'https://app.test/verified'
        )
      ).rejects.toMatchObject({ code: ErrorCode.AccountEmailAlreadyVerified });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    test('rejects a redirect to a host that is not allowed', async () => {
      await expect(
        service.sendEmailVerification(authUser(), 'https://evil.test/phish')
      ).rejects.toMatchObject({ code: ErrorCode.AuthInvalidRedirectUrl });
      expect(securityStore.generateOneTimeToken).not.toHaveBeenCalled();
    });

    test('rejects a malformed redirect URL', async () => {
      await expect(
        service.sendEmailVerification(authUser(), 'not a url')
      ).rejects.toMatchObject({ code: ErrorCode.AuthInvalidRedirectUrl });
    });

    test('is not supported without the mailer', async () => {
      await expect(
        createService(false).sendEmailVerification(
          authUser(),
          'https://app.test/verified'
        )
      ).rejects.toMatchObject({ code: ErrorCode.AccountFeatureUnavailable });
    });
  });

  describe('verifyEmailAddress', () => {
    test('marks the email of the token user as verified', async () => {
      await expect(service.verifyEmailAddress('ott')).resolves.toBe(
        'E-mail address verified'
      );

      expect(securityStore.useOneTimeToken).toHaveBeenCalledWith(
        'ott',
        AuthOTTPurpose.EmailVerification
      );
      expect(authService.updateAuthUser).toHaveBeenCalledWith(1, {
        verifiedEmail: true
      });
    });

    test('rejects a disabled or missing user', async () => {
      authService.findById.mockResolvedValue(authUser({ enabled: false }));
      await expect(service.verifyEmailAddress('ott')).rejects.toMatchObject({
        code: ErrorCode.AuthUserNotFound
      });

      authService.findById.mockResolvedValue(null);
      await expect(service.verifyEmailAddress('ott')).rejects.toMatchObject({
        code: ErrorCode.AuthUserNotFound
      });
      expect(authService.updateAuthUser).not.toHaveBeenCalled();
    });

    test('rejects an email that is already verified', async () => {
      authService.findById.mockResolvedValue(authUser({ verifiedEmail: true }));

      await expect(service.verifyEmailAddress('ott')).rejects.toMatchObject({
        code: ErrorCode.AccountEmailAlreadyVerified
      });
    });

    test('propagates an invalid token', async () => {
      securityStore.useOneTimeToken.mockRejectedValue(
        new AuthError(ErrorCode.AuthInvalidToken, 'Invalid token')
      );

      await expect(service.verifyEmailAddress('ott')).rejects.toThrow(
        'Invalid token'
      );
      expect(authService.updateAuthUser).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmailAddressRedirect', () => {
    test('verifies the email and returns the redirect URL', async () => {
      await expect(service.verifyEmailAddressRedirect('ott')).resolves.toEqual({
        redirectUrl: 'https://app.test/verified?',
        status: 'ok',
        message: 'E-mail address verified'
      });
      expect(authService.updateAuthUser).toHaveBeenCalledWith(1, {
        verifiedEmail: true
      });
    });

    test('appends to a redirect URL that has a query', async () => {
      tokenData.redirectToUrl = 'https://app.test/verified?lang=en';

      const result = await service.verifyEmailAddressRedirect('ott');

      expect(result.redirectUrl).toBe('https://app.test/verified?lang=en&');
    });

    test('reports a disabled user as an error', async () => {
      authService.findById.mockResolvedValue(authUser({ enabled: false }));

      const result = await service.verifyEmailAddressRedirect('ott');

      expect(result.status).toBe('error');
      expect(authService.updateAuthUser).not.toHaveBeenCalled();
    });

    test('reports an already verified email as an error', async () => {
      authService.findById.mockResolvedValue(authUser({ verifiedEmail: true }));

      const result = await service.verifyEmailAddressRedirect('ott');

      expect(result).toMatchObject({
        status: 'error',
        message: 'Email address is already verified'
      });
    });
  });

  describe('sendResetPassword', () => {
    test('emails a reset link with a password reset token', async () => {
      await expect(
        service.sendResetPassword('user@test.com', 'https://app.test/reset')
      ).resolves.toBe('Password reset email sent');

      expect(securityStore.generateOneTimeToken).toHaveBeenCalledWith(
        AuthOTTPurpose.PasswordReset,
        { authUserId: 1, authSource: AuthSource.Password },
        accountConfig.RESET_PASSWORD_OTT_TTL
      );
      expect(lastEmail().template).toBe('emails/password-reset');
      expect(lastEmail().data.link).toMatch(
        /https:\/\/app\.test\/reset\?token=ott$/
      );
    });

    test('renders the email in the given locale', async () => {
      await service.sendResetPassword(
        'user@test.com',
        'https://app.test/reset',
        'de'
      );

      expect(lastEmail().locale).toBe('de');
    });

    test('sends the plain text of the translations without the template engine', async () => {
      await createService(true, false).sendResetPassword(
        'user@test.com',
        'https://app.test/reset'
      );

      const email = sendPlainEmail.mock.calls[0][0];
      expect(email.subject).toBe('Password reset request');
      expect(email.text).toContain('\n\nhttps://app.test/reset?token=ott\n\n');
      expect(email.text).toContain('you can safely ignore this email.');
    });

    test.each([
      ['an unknown user', null],
      ['a disabled user', authUser({ enabled: false, passwordHash: 'hash' })],
      ['a user without a password', authUser()]
    ])(
      'answers %s like any other user without sending an email',
      async (_, user) => {
        authService.findByUsername.mockResolvedValue(user);

        await expect(
          service.sendResetPassword('user@test.com', 'https://app.test/reset')
        ).resolves.toBe('Password reset email sent');

        expect(securityStore.generateOneTimeToken).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
      }
    );

    test('rejects a redirect to a host that is not allowed', async () => {
      await expect(
        service.sendResetPassword('user@test.com', 'https://evil.test/reset')
      ).rejects.toMatchObject({ code: ErrorCode.AuthInvalidRedirectUrl });
      expect(securityStore.generateOneTimeToken).not.toHaveBeenCalled();
    });

    test('rejects a redirect that is not allowed for an unknown user too', async () => {
      authService.findByUsername.mockResolvedValue(null);

      await expect(
        service.sendResetPassword('nobody@test.com', 'https://evil.test/reset')
      ).rejects.toMatchObject({ code: ErrorCode.AuthInvalidRedirectUrl });
    });

    test('is not supported without the mailer', async () => {
      await expect(
        createService(false).sendResetPassword(
          'user@test.com',
          'https://app.test/reset'
        )
      ).rejects.toMatchObject({ code: ErrorCode.AccountFeatureUnavailable });
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      authService.findById.mockResolvedValue(
        authUser({ passwordHash: 'hash' })
      );
    });

    test('stores the hash of the new password and logs the user out', async () => {
      await expect(service.resetPassword('ott', STRONG_PASSWORD)).resolves.toBe(
        'Password reset successfully'
      );

      expect(securityStore.useOneTimeToken).toHaveBeenCalledWith(
        'ott',
        AuthOTTPurpose.PasswordReset
      );
      const [id, data] = authService.updateAuthUser.mock.calls[0];
      expect(id).toBe(1);
      expect(data.logoutAt).toBeInstanceOf(Date);
      await expect(
        checkPassword(STRONG_PASSWORD, data.passwordHash)
      ).resolves.toBe(true);
    });

    test('rejects a weak password without using the token', async () => {
      await expect(service.resetPassword('ott', 'weak')).rejects.toMatchObject({
        code: ErrorCode.AuthPasswordWeak
      });
      expect(securityStore.useOneTimeToken).not.toHaveBeenCalled();
    });

    test('rejects a disabled user', async () => {
      authService.findById.mockResolvedValue(
        authUser({ enabled: false, passwordHash: 'hash' })
      );

      await expect(
        service.resetPassword('ott', STRONG_PASSWORD)
      ).rejects.toMatchObject({ code: ErrorCode.AuthUserNotFound });
      expect(authService.updateAuthUser).not.toHaveBeenCalled();
    });

    test('rejects a user without a password', async () => {
      authService.findById.mockResolvedValue(authUser());

      await expect(
        service.resetPassword('ott', STRONG_PASSWORD)
      ).rejects.toMatchObject({ code: ErrorCode.AccountPasswordNotSet });
    });
  });

  describe('send2FACode', () => {
    test('emails a six digit code and stores only its hash', async () => {
      const result = await service.send2FACode(authUser());

      const code = lastEmail().data.code;
      expect(code).toMatch(/^\d{6}$/);
      expect(lastEmail().template).toBe('emails/two-factor-code');
      expect(securityStore.generateOneTimeToken).toHaveBeenCalledWith(
        AuthOTTPurpose.TwoFAVerification,
        { authUserId: 1, codeHash: makeHash(code), purpose: 'authentication' },
        twoFactorConfig.OTT_TTL
      );
      expect(result).toEqual({
        challengeId: 'ott',
        expiresIn: twoFactorConfig.OTT_TTL
      });
    });

    test('keeps the requested purpose', async () => {
      await service.send2FACode(authUser(), 'passwordReset');

      expect(securityStore.generateOneTimeToken.mock.calls[0][1].purpose).toBe(
        'passwordReset'
      );
    });

    test('sends the plain text of the translations without the template engine', async () => {
      await createService(true, false).send2FACode(authUser());

      const email = sendPlainEmail.mock.calls[0][0];
      expect(sendEmail).not.toHaveBeenCalled();
      expect(email.to).toBe('user@test.com');
      expect(email.subject).toBe('Your verification code');
      expect(email.text).toMatch(
        /^Hello,\n\nPlease enter the following code to continue:\n\n\d{6}\n\nThe code expires in 5 minutes\.\n\n--\nThis email was sent by /
      );
    });

    test('is not supported without the mailer', async () => {
      await expect(
        createService(false).send2FACode(authUser())
      ).rejects.toMatchObject({ code: ErrorCode.AccountFeatureUnavailable });
    });
  });

  describe('verify2FACode', () => {
    beforeEach(() => {
      tokenData = {
        authUserId: 1,
        codeHash: makeHash('123456'),
        purpose: AuthOTTPurpose.Authentication
      };
    });

    test('issues a token for the purpose of the challenge', async () => {
      await expect(
        service.verify2FACode('challenge', '123456')
      ).resolves.toEqual({
        token: 'ott',
        expiresIn: securityConfig.AUTH_OTT_TTL
      });

      expect(securityStore.generateOneTimeToken).toHaveBeenCalledWith(
        AuthOTTPurpose.Authentication,
        { authUserId: 1, authSource: AuthSource.Password },
        securityConfig.AUTH_OTT_TTL
      );
    });

    test('rejects a wrong code', async () => {
      await expect(
        service.verify2FACode('challenge', '654321')
      ).rejects.toThrow('Invalid 2FA code provided');
      expect(securityStore.generateOneTimeToken).not.toHaveBeenCalled();
    });

    test('rejects a disabled user', async () => {
      authService.findById.mockResolvedValue(authUser({ enabled: false }));

      await expect(
        service.verify2FACode('challenge', '123456')
      ).rejects.toMatchObject({ code: ErrorCode.AuthUserNotFound });
      expect(securityStore.generateOneTimeToken).not.toHaveBeenCalled();
    });
  });
});
