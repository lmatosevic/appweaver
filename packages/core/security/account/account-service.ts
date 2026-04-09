import {
  AuthOTTPurpose,
  AuthSource,
  AuthUser,
  config,
  makeHash,
  randomString,
  SecurityStore
} from '@appweaver/common';
import { AuthService } from '../auth-service';
import {
  hashPassword,
  validatePasswordComplexity,
  validateRedirectUrl
} from '../helper';
import { inject } from '../../context';
import { EmailService } from '../../mailer';
import { HttpError } from '../../errors';
import { AuthOTTData, TwoFactorAuthData } from '../../types';

type VerifyEmailData = {
  authUserId: number;
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

  /**
   * Sends an email verification link to the specified user's email address.
   *
   * @param {AuthUser} authUser - The user object for whom the email verification is to be sent.
   * @param {string} redirectToUrl - The URL to which the user will be redirected after verifying their email address.
   * @param {VerificationType} [verificationType=VerificationType.Auto] - The type of verification process to use.
   * Defaults to auto verification.
   * @return {Promise<string>} A promise that resolves to a confirmation message upon successful email delivery.
   * @throws {HttpError} Throws a 501 error if email verification is not supported.
   * @throws {HttpError} Throws a 403 error if the user's email address is already verified.
   * @throws {HttpError} Throws a 400 error if the provided redirect URL is invalid.
   */
  public async sendEmailVerification(
    authUser: AuthUser,
    redirectToUrl: string,
    verificationType: VerificationType = VerificationType.Auto
  ): Promise<string> {
    if (!this._emailService) {
      throw new HttpError('Email verification is not supported', 501);
    }

    if (authUser.verifiedEmail) {
      throw new HttpError('Email address is already verified', 403);
    }

    const result = validateRedirectUrl(redirectToUrl);
    if (!result.valid) {
      throw new HttpError(result.message, 400);
    }

    const token =
      await this._securityStore.generateOneTimeToken<VerifyEmailData>(
        AuthOTTPurpose.EmailVerification,
        { authUserId: authUser.id, redirectToUrl },
        config.SECURITY_ACCOUNT_VERIFY_EMAIL_OTT_TTL
      );

    const accountPath = config.SECURITY_ACCOUNT_ROUTE_PREFIX.replace(/\/$/, '');

    const separator = redirectToUrl.includes('?') ? '&' : '?';
    const verifyLink =
      verificationType === VerificationType.Auto
        ? `${config.APP_HOSTNAME}${accountPath}/verify-email-redirect?token=${token}}`
        : `${redirectToUrl}${separator}token=${token}`;

    await this._emailService.sendEmail({
      to: authUser.email,
      subject: 'Verify email address',
      text: `Please verify your email address on following link: ${verifyLink}`
    });

    return 'Verification email sent';
  }

  /**
   * Verifies the email address associated with a given token and returns a success message.
   *
   * @param {string} token The one-time token used for email verification.
   * @return {Promise<string>} A confirmation message indicating the email address has been verified.
   * @throws {HttpError} If the authentication user does not exist, is disabled, or the email has already been verified.
   */
  public async verifyEmailAddress(token: string): Promise<string> {
    const { authUserId } =
      await this._securityStore.useOneTimeToken<VerifyEmailData>(
        token,
        AuthOTTPurpose.EmailVerification
      );

    const authUser = await this._authService.findById(authUserId);
    if (!authUser || !authUser.enabled) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    if (authUser.verifiedEmail) {
      throw new HttpError('Email address is already verified', 403);
    }

    await this._authService.updateAuthUser(authUserId, { verifiedEmail: true });

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
   * Sends a password reset email to the specified email address with a link for resetting the password.
   *
   * @param {string} email - The email address of the user requesting a password reset.
   * @param {string} redirectToUrl - The URL to be appended with a token for the password reset link.
   * @return {Promise<string>} A promise that resolves to a confirmation message upon successful email dispatch.
   * @throws {HttpError} If the email service is not configured, the user does not exist or is disabled, the user has no
   * password set, or the redirect URL is invalid.
   */
  public async sendResetPassword(
    email: string,
    redirectToUrl: string
  ): Promise<string> {
    if (!this._emailService) {
      throw new HttpError('Password reset is not supported', 501);
    }

    const authUser = await this._authService.findByUsername(email);
    if (!authUser || !authUser.enabled) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    if (!authUser.passwordHash) {
      throw new HttpError('Auth user does not have already set password', 403);
    }

    const result = validateRedirectUrl(redirectToUrl);
    if (!result.valid) {
      throw new HttpError(result.message, 400);
    }

    const token = await this._securityStore.generateOneTimeToken<AuthOTTData>(
      AuthOTTPurpose.PasswordReset,
      { authUserId: authUser.id, authSource: AuthSource.Password },
      config.SECURITY_ACCOUNT_RESET_PASSWORD_OTT_TTL
    );

    const separator = redirectToUrl.includes('?') ? '&' : '?';
    const changePasswordLink = `${redirectToUrl}${separator}token=${token}`;

    await this._emailService.sendEmail({
      to: authUser.email,
      subject: 'Password reset request',
      text: `Please change your password on following link: ${changePasswordLink}`
    });

    return 'Password reset email sent';
  }

  /**
   * Resets the password for a user using a one-time token.
   *
   * @param {string} token - The one-time token used for password reset.
   * @param {string} password - The new password to be set for the user.
   * @return {Promise<string>} A message indicating the success of the password reset operation.
   * @throws {HttpError} If the password does not meet the required complexity, if the token is invalid,
   *                     if the user does not exist, if the user is disabled, or if the user does not have
   *                     an existing password to reset.
   */
  public async resetPassword(token: string, password: string): Promise<string> {
    const result = validatePasswordComplexity(password);
    if (!result.valid) {
      throw new HttpError(result.message, 400);
    }

    const { authUserId } =
      await this._securityStore.useOneTimeToken<AuthOTTData>(
        token,
        AuthOTTPurpose.PasswordReset
      );

    const authUser = await this._authService.findById(authUserId);
    if (!authUser || !authUser.enabled) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    if (!authUser.passwordHash) {
      throw new HttpError('Auth user does not have already set password', 403);
    }

    await this._authService.updateAuthUser(authUserId, {
      logoutAt: new Date(),
      passwordHash: await hashPassword(password)
    });

    return 'Password reset successfully';
  }

  /**
   * Sends a two-factor authentication (2FA) code to the specified user via email for a given purpose.
   *
   * @param {AuthUser} authUser - The authenticated user to whom the 2FA code will be sent.
   * @param {string} [purpose='authentication'] - The purpose for sending the 2FA code (e.g., authentication, account
   * recovery).
   * @return {Promise<string>} A promise that resolves to the unique challenge ID associated with the 2FA code.
   * @throws {HttpError} If the email service is not available, an error with a 501 status code is thrown.
   */
  public async send2FACode(
    authUser: AuthUser,
    purpose: string = 'authentication'
  ): Promise<string> {
    if (!this._emailService) {
      throw new HttpError('2FA is not supported', 501);
    }

    const code = randomString(6, { numbers: true });
    const challengeId =
      await this._securityStore.generateOneTimeToken<TwoFactorAuthData>(
        AuthOTTPurpose.TwoFAVerification,
        { authUserId: authUser.id, codeHash: makeHash(code), purpose },
        config.SECURITY_ACCOUNT_2FA_OTT_TTL
      );

    await this._emailService.sendEmail({
      to: authUser.email,
      subject: 'Verification code',
      text: `Please enter the following code: ${code}`
    });

    return challengeId;
  }

  /**
   * Verifies a two-factor authentication (2FA) code for a provided challenge ID.
   *
   * @param challengeId The unique identifier of the 2FA challenge.
   * @param code The 2FA code entered by the user.
   * @return A promise that resolves to a one-time token if the 2FA verification is successful.
   *         Throws an error if verification fails or the associated user is disabled or does not exist.
   */
  public async verify2FACode(
    challengeId: string,
    code: string
  ): Promise<string> {
    const data = await this._securityStore.useOneTimeToken<TwoFactorAuthData>(
      challengeId,
      AuthOTTPurpose.TwoFAVerification,
      (value) => {
        if (value.codeHash !== makeHash(code)) {
          return { valid: false, message: 'Invalid 2FA code provided' };
        }
        return { valid: true, message: 'OK' };
      }
    );

    const authUser = await this._authService.findById(data.authUserId);
    if (!authUser || !authUser.enabled) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    return this._securityStore.generateOneTimeToken<AuthOTTData>(
      data.purpose,
      { authUserId: authUser.id, authSource: AuthSource.Password },
      config.SECURITY_AUTH_OTT_TTL
    );
  }
}
