import {
  AuthOTTPurpose,
  AuthSource,
  AuthUser,
  createLogger,
  ErrorCode,
  makeHash,
  ResourceId,
  SecurityStore,
  appConfig,
  AccountError,
  AuthError
} from '@appweaver/common';
import { accountConfig } from '../security-config';
import { AuthService } from '../auth-service';
import { hashPassword, validatePasswordComplexity } from '@appweaver/data';
import { validateRedirectUrl } from '../access-util';
import {
  inject,
  EmailService,
  LocaleService,
  SmsService
} from '@appweaver/core';
import { AuthOTTData, PhoneVerificationData } from '../../types/http-auth';
import { TwoFactorService } from '../two-factor/two-factor-service';
import {
  codeChallengeValidator,
  generateCode,
  matchesCodeHash
} from '../two-factor/utils/code-util';
import { sendAccountEmail } from './utils/account-email';

const logger = createLogger('security');

type VerifyEmailData = {
  authUserId: ResourceId;
  redirectToUrl: string;
};

export enum VerificationType {
  Auto = 'auto',
  Manual = 'manual'
}

export class AccountService {
  /** @internal */
  private readonly _authService = inject(AuthService);
  /** @internal */
  private readonly _securityStore = inject(SecurityStore);
  /** @internal */
  private readonly _emailService = inject(EmailService, false);
  /** @internal */
  private readonly _smsService = inject(SmsService, false);
  /** @internal */
  private readonly _twoFactorService = inject(TwoFactorService);

  /**
   * Sends an email verification link to the specified user's email address.
   *
   * @param {AuthUser} authUser - The user object for whom the email verification is to be sent.
   * @param {string} redirectToUrl - The URL to which the user will be redirected after verifying their email address.
   * @param {VerificationType} [verificationType=VerificationType.Auto] - The type of verification process to use.
   * Defaults to auto verification.
   * @param {string} [locale] - The locale of the email, rendered from the `emails/verify-email` templates. Defaults to
   * the `LOCALE_DEFAULT` config.
   * @return {Promise<string>} A promise that resolves to a confirmation message upon successful email delivery.
   * @throws {AccountError} `ACCOUNT_FEATURE_UNAVAILABLE` if email verification is not supported.
   * @throws {AccountError} `ACCOUNT_EMAIL_ALREADY_VERIFIED` if the user's email address is already verified.
   * @throws {AuthError} `AUTH_INVALID_REDIRECT_URL` if the provided redirect URL is invalid.
   */
  public async sendEmailVerification(
    authUser: AuthUser,
    redirectToUrl: string,
    verificationType: VerificationType = VerificationType.Auto,
    locale?: string
  ): Promise<string> {
    if (!this._emailService) {
      throw new AccountError(
        ErrorCode.AccountFeatureUnavailable,
        'Email verification is not supported',
        { feature: 'email-verification' }
      );
    }

    if (authUser.verifiedEmail) {
      throw new AccountError(
        ErrorCode.AccountEmailAlreadyVerified,
        'Email address is already verified'
      );
    }

    const result = validateRedirectUrl(redirectToUrl);
    if (!result.valid) {
      throw new AuthError(ErrorCode.AuthInvalidRedirectUrl, result.message);
    }

    const token =
      await this._securityStore.generateOneTimeToken<VerifyEmailData>(
        AuthOTTPurpose.EmailVerification,
        { authUserId: authUser.id, redirectToUrl },
        accountConfig.VERIFY_EMAIL_OTT_TTL
      );

    const accountPath = accountConfig.ROUTE_PREFIX.replace(/\/$/, '');

    const separator = redirectToUrl.includes('?') ? '&' : '?';
    const verifyLink =
      verificationType === VerificationType.Auto
        ? `${appConfig.HOSTNAME}${accountPath}/verify-email-redirect?token=${token}`
        : `${redirectToUrl}${separator}token=${token}`;

    await sendAccountEmail(
      this._emailService,
      {
        to: authUser.email,
        template: 'emails/verify-email',
        data: { email: authUser.email, link: verifyLink },
        locale
      },
      'emails.verifyEmail',
      (t) => [t('emails.verifyEmail.message'), verifyLink]
    );

    logger.debug({ id: authUser.id }, 'Verification email sent');

    return 'Verification email sent';
  }

  /**
   * Verifies the email address associated with a given token and returns a success message.
   *
   * @param {string} token The one-time token used for email verification.
   * @return {Promise<string>} A confirmation message indicating the email address has been verified.
   * @throws {AuthError} `AUTH_USER_NOT_FOUND` if the authentication user does not exist or is disabled.
   * @throws {AccountError} `ACCOUNT_EMAIL_ALREADY_VERIFIED` if the email has already been verified.
   */
  public async verifyEmailAddress(token: string): Promise<string> {
    const { authUserId } =
      await this._securityStore.useOneTimeToken<VerifyEmailData>(
        token,
        AuthOTTPurpose.EmailVerification
      );

    const authUser = await this._authService.findById(authUserId);
    if (!authUser || !authUser.enabled) {
      throw new AuthError(
        ErrorCode.AuthUserNotFound,
        'Auth user does not exist or is disabled'
      );
    }

    if (authUser.verifiedEmail) {
      throw new AccountError(
        ErrorCode.AccountEmailAlreadyVerified,
        'Email address is already verified'
      );
    }

    await this._authService.updateAuthUser(authUserId, { verifiedEmail: true });

    logger.debug({ id: authUserId }, 'Email address verified');

    return 'E-mail address verified';
  }

  /**
   * Verify the email address associated with a one-time token and generates a redirection URL.
   *
   * @param {string} token - The one-time token used to verify the email address.
   * @return {Promise<{ status: 'ok' | 'error'; message: string; redirectUrl: string }>} An object containing the
   * verification status, a message, and the constructed redirection URL.
   */
  public async verifyEmailAddressRedirect(
    token: string
  ): Promise<{ status: 'ok' | 'error'; message: string; redirectUrl: string }> {
    const { authUserId, redirectToUrl } =
      await this._securityStore.useOneTimeToken<VerifyEmailData>(
        token,
        AuthOTTPurpose.EmailVerification
      );

    const separator = redirectToUrl.includes('?') ? '&' : '?';
    const redirectUrl = `${redirectToUrl}${separator}`;

    const authUser = await this._authService.findById(authUserId);
    if (!authUser || !authUser.enabled) {
      return {
        redirectUrl,
        status: 'error',
        message: 'Auth user does not exist or is disabled'
      };
    }

    if (authUser.verifiedEmail) {
      return {
        redirectUrl,
        status: 'error',
        message: 'Email address is already verified'
      };
    }

    await this._authService.updateAuthUser(authUserId, { verifiedEmail: true });

    return { redirectUrl, status: 'ok', message: 'E-mail address verified' };
  }

  /**
   * Sends a password reset email to the specified email address with a link for resetting the password. The same
   * confirmation is returned whether an email was sent or not, so the response does not reveal which addresses
   * belong to an enabled user with a password.
   *
   * @param {string} email - The email address of the user requesting a password reset.
   * @param {string} redirectToUrl - The URL to be appended with a token for the password reset link.
   * @param {string} [locale] - The locale of the email, rendered from the `emails/password-reset` templates. Defaults
   * to the `LOCALE_DEFAULT` config.
   * @return {Promise<string>} A promise that resolves to a confirmation message, also when no user with a password
   * matches the email address and nothing is sent.
   * @throws {AccountError} `ACCOUNT_FEATURE_UNAVAILABLE` if the email service is not configured.
   * @throws {AuthError} `AUTH_INVALID_REDIRECT_URL` if the redirect URL is invalid.
   */
  public async sendResetPassword(
    email: string,
    redirectToUrl: string,
    locale?: string
  ): Promise<string> {
    const sentMessage = 'Password reset email sent';

    if (!this._emailService) {
      throw new AccountError(
        ErrorCode.AccountFeatureUnavailable,
        'Password reset is not supported',
        { feature: 'password-reset' }
      );
    }

    const result = validateRedirectUrl(redirectToUrl);
    if (!result.valid) {
      throw new AuthError(ErrorCode.AuthInvalidRedirectUrl, result.message);
    }

    const authUser = await this._authService.findByUsername(email);
    if (!authUser || !authUser.enabled || !authUser.passwordHash) {
      // Answered the same, so the response tells nothing of the account
      logger.debug(
        { id: authUser?.id },
        'Password reset skipped, no enabled user with a password'
      );
      return sentMessage;
    }

    const token = await this._securityStore.generateOneTimeToken<AuthOTTData>(
      AuthOTTPurpose.PasswordReset,
      { authUserId: authUser.id, authSource: AuthSource.Password },
      accountConfig.RESET_PASSWORD_OTT_TTL
    );

    const separator = redirectToUrl.includes('?') ? '&' : '?';
    const changePasswordLink = `${redirectToUrl}${separator}token=${token}`;

    await sendAccountEmail(
      this._emailService,
      {
        to: authUser.email,
        template: 'emails/password-reset',
        data: { email: authUser.email, link: changePasswordLink },
        locale
      },
      'emails.passwordReset',
      (t) => [
        t('emails.passwordReset.message'),
        changePasswordLink,
        t('emails.passwordReset.ignore')
      ]
    );

    logger.debug({ id: authUser.id }, 'Password reset email sent');

    return sentMessage;
  }

  /**
   * Resets the password for a user using a one-time token.
   *
   * @param {string} token - The one-time token used for password reset.
   * @param {string} password - The new password to be set for the user.
   * @return {Promise<string>} A message indicating the success of the password reset operation.
   * @throws {AuthError} If the password does not meet the required complexity, if the token is invalid,
   *                     if the user does not exist, if the user is disabled, or if the user does not have
   *                     an existing password to reset.
   */
  public async resetPassword(token: string, password: string): Promise<string> {
    const result = validatePasswordComplexity(password);
    if (!result.valid) {
      throw new AuthError(ErrorCode.AuthPasswordWeak, result.message, {
        reason: result.message
      });
    }

    const { authUserId } =
      await this._securityStore.useOneTimeToken<AuthOTTData>(
        token,
        AuthOTTPurpose.PasswordReset
      );

    const authUser = await this._authService.findById(authUserId);
    if (!authUser || !authUser.enabled) {
      throw new AuthError(
        ErrorCode.AuthUserNotFound,
        'Auth user does not exist or is disabled'
      );
    }

    if (!authUser.passwordHash) {
      throw new AccountError(
        ErrorCode.AccountPasswordNotSet,
        'Auth user does not have already set password'
      );
    }

    await this._authService.updateAuthUser(authUserId, {
      logoutAt: new Date(),
      passwordHash: await hashPassword(password)
    });

    logger.debug({ id: authUserId }, 'Password reset');

    return 'Password reset successfully';
  }

  /**
   * Sends a code to a phone number by SMS, which {@link verifyPhone} checks to set it as the verified phone number of
   * the user.
   *
   * @param {AuthUser} authUser - The user verifying the phone number.
   * @param {string} phoneNumber - The phone number in the E.164 format, i.e. `+385911234567`.
   * @param {string} [locale] - The locale of the message, the `sms.verifyPhone` translation. Defaults to the
   * `LOCALE_DEFAULT` config.
   * @return {Promise<{ challengeId: string; expiresIn: number }>} The id of the challenge and its expiration time.
   * @throws {AccountError} `ACCOUNT_FEATURE_UNAVAILABLE` without an SMS sender, `ACCOUNT_PHONE_ALREADY_VERIFIED` for
   * the verified number of the user.
   * @throws {SmsError} `SMS_SEND_FAILED` if the provider rejects the message, i.e. for an invalid number.
   */
  public async sendPhoneVerification(
    authUser: AuthUser,
    phoneNumber: string,
    locale?: string
  ): Promise<{ challengeId: string; expiresIn: number }> {
    if (!this._smsService) {
      throw new AccountError(
        ErrorCode.AccountFeatureUnavailable,
        'Phone verification is not supported',
        { feature: 'phone-verification' }
      );
    }

    if (authUser.verifiedPhone && authUser.phoneNumber === phoneNumber) {
      throw new AccountError(
        ErrorCode.AccountPhoneAlreadyVerified,
        'Phone number is already verified'
      );
    }

    const code = generateCode();
    const expiresIn = accountConfig.VERIFY_PHONE_OTT_TTL;
    const challengeId =
      await this._securityStore.generateOneTimeToken<PhoneVerificationData>(
        AuthOTTPurpose.PhoneVerification,
        {
          authUserId: authUser.id,
          phoneNumber,
          codeHash: makeHash(code),
          attempts: 0
        },
        expiresIn
      );

    const text = inject(LocaleService).translate('sms.verifyPhone', locale, {
      code,
      appName: appConfig.NAME,
      count: Math.ceil(expiresIn / 60_000)
    });
    await this._smsService.sendSms({ to: phoneNumber, text });

    logger.debug({ id: authUser.id, challengeId }, 'Phone verification sent');

    return { challengeId, expiresIn };
  }

  /**
   * Verifies the code sent by {@link sendPhoneVerification}, setting the phone number as the verified one of the user.
   * A changed number removes the SMS 2FA method of the user, enabled again for the new number. A wrong code counts
   * against the `security.account.2fa.maxAttempts` of the challenge.
   *
   * @param {AuthUser} authUser - The user verifying the phone number.
   * @param {string} challengeId - The id of the challenge.
   * @param {string} code - The code received by SMS.
   * @return {Promise<string>} A confirmation message.
   * @throws {AuthError} `AUTH_INVALID_TOKEN` for an expired challenge or the one of another user.
   * @throws {AccountError} `ACCOUNT_2FA_CODE_INVALID` for a wrong code, `ACCOUNT_2FA_TOO_MANY_ATTEMPTS` for the last
   * wrong code allowed, which revokes the challenge.
   */
  public async verifyPhone(
    authUser: AuthUser,
    challengeId: string,
    code: string
  ): Promise<string> {
    const { phoneNumber } =
      await this._securityStore.useOneTimeToken<PhoneVerificationData>(
        challengeId,
        AuthOTTPurpose.PhoneVerification,
        codeChallengeValidator(authUser.id, (data) =>
          matchesCodeHash(data.codeHash, code)
        )
      );

    if (authUser.phoneNumber !== phoneNumber) {
      await this._twoFactorService.removeSmsMethod(authUser);
    }

    await this._authService.updateAuthUser(authUser.id, {
      phoneNumber,
      verifiedPhone: true
    });

    logger.debug({ id: authUser.id }, 'Phone number verified');

    return 'Phone number verified';
  }
}
