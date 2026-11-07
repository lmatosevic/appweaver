import { BaseModule, RequestOptions } from './base-module';
import { BaseClientInterface } from '../base-client-interface';
import { ACCOUNT_OPERATIONS, ACCOUNT_TYPES } from '../../constants';

export type AccountType = Record<(typeof ACCOUNT_TYPES)[number], unknown>;

export type AccountInterface = {
  [K in keyof typeof ACCOUNT_OPERATIONS]: (...args: any[]) => Promise<any>;
};

export class AccountClient<Account extends AccountType>
  extends BaseModule
  implements AccountInterface
{
  constructor(
    client: BaseClientInterface,
    public readonly basePath: string
  ) {
    super(client);
  }

  /**
   * Sends a verification email to the user's registered email address.
   *
   * @param {Object} request - The payload identifying the account to send the email to.
   * @param {RequestOptions} options - Additional request options.
   * @return A status response indicating whether the email was dispatched successfully.
   */
  public async sendVerifyEmail(
    request: Account['sendEmailVerificationRequest'],
    options: RequestOptions = {}
  ): Promise<Account['statusResponse']> {
    return this.sendRequest('post', `${this.basePath}/send-verify-email`, {
      ...options,
      body: request
    });
  }

  /**
   * Verifies a user's email address using a verification token.
   *
   * @param {Object} request - The payload containing the verification token.
   * @param {RequestOptions} options - Additional request options.
   * @return A status response indicating whether the email was verified successfully.
   */
  public async verifyEmail(
    request: Account['emailVerificationRequest'],
    options: RequestOptions = {}
  ): Promise<Account['statusResponse']> {
    return this.sendRequest('post', `${this.basePath}/verify-email`, {
      ...options,
      body: request
    });
  }

  /**
   * Handles the redirect-based email verification flow by passing the token as a query parameter.
   *
   * Typically used as the target of a link sent in a verification email.
   *
   * @param {string} token - The email verification token from the redirect URL.
   * @param {RequestOptions} options - Additional request options.
   * @return The server response for the redirect verification (shape depends on the API).
   */
  public async verifyEmailRedirect(
    token: string,
    options: RequestOptions = {}
  ): Promise<any> {
    return this.sendRequest('get', `${this.basePath}/verify-email-redirect`, {
      ...options,
      params: {
        ...(options.params ?? {}),
        query: {
          ...(options.params?.query ?? {}),
          token
        }
      }
    });
  }

  /**
   * Sends a password reset email to the user's registered email address.
   *
   * @param {Object} request - The payload identifying the account (e.g., email address).
   * @param {RequestOptions} options - Additional request options.
   * @return A status response indicating whether the reset email was dispatched successfully.
   */
  public async sendResetPassword(
    request: Account['sendResetPasswordRequest'],
    options: RequestOptions = {}
  ): Promise<Account['statusResponse']> {
    return this.sendRequest('post', `${this.basePath}/send-reset-password`, {
      ...options,
      body: request
    });
  }

  /**
   * Resets the user's password using a reset token.
   *
   * @param {Object} request - The payload containing the reset token and the new password.
   * @param {RequestOptions} options - Additional request options.
   * @return A status response indicating whether the password was reset successfully.
   */
  public async resetPassword(
    request: Account['resetPasswordRequest'],
    options: RequestOptions = {}
  ): Promise<Account['statusResponse']> {
    return this.sendRequest('post', `${this.basePath}/reset-password`, {
      ...options,
      body: request
    });
  }

  /**
   * Sends a verification code by SMS to a phone number of the signed-in user.
   *
   * @param {Object} request - The phone number in the E.164 format, by default the one of the user.
   * @param {RequestOptions} options - Additional request options.
   * @return The id of the challenge and its expiration time.
   */
  public async sendVerifyPhone(
    request: Account['sendPhoneVerificationRequest'] = {},
    options: RequestOptions = {}
  ): Promise<Account['challengeResponse']> {
    return this.sendRequest('post', `${this.basePath}/send-verify-phone`, {
      ...options,
      body: request
    });
  }

  /**
   * Verifies the phone number of the signed-in user with the code received by SMS.
   *
   * @param {Object} request - The id of the challenge and the code.
   * @param {RequestOptions} options - Additional request options.
   * @return A status response indicating whether the phone number was verified.
   */
  public async verifyPhone(
    request: Account['verifyPhoneRequest'],
    options: RequestOptions = {}
  ): Promise<Account['statusResponse']> {
    return this.sendRequest('post', `${this.basePath}/verify-phone`, {
      ...options,
      body: request
    });
  }
}
