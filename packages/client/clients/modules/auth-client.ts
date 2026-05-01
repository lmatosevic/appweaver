import { Client } from 'openapi-fetch';
import { BaseClient, RequestOptions } from './base-client';
import { AUTH_OPERATIONS, AUTH_TYPES } from '../../constants';

export type AuthType = Record<(typeof AUTH_TYPES)[number], unknown>;

export type AuthInterface = {
  [K in keyof typeof AUTH_OPERATIONS]: (...args: any[]) => Promise<any>;
};

export class AuthClient<Auth extends AuthType>
  extends BaseClient
  implements AuthInterface
{
  constructor(
    client: Client<{ [key: string]: any }>,
    public readonly basePath: string
  ) {
    super(client);
  }

  /**
   * Authenticates a user with the provided credentials.
   *
   * @param {Object} request - The login payload (e.g., email and password).
   * @param {RequestOptions} options - Additional request options.
   * @returns An authentication response containing tokens and session info.
   */
  public async login(
    request: Auth['loginRequest'],
    options: RequestOptions = {}
  ): Promise<Auth['authenticationResponse']> {
    return this.sendRequest('post', `${this.basePath}/login`, {
      ...options,
      body: request
    });
  }

  /**
   * Logs out the currently authenticated user and invalidates the session.
   *
   * @param {RequestOptions} options - Additional request options.
   * @returns The logout response from the server.
   */
  public async logout(
    options: RequestOptions = {}
  ): Promise<Auth['logoutResponse']> {
    return this.sendRequest('post', `${this.basePath}/logout`, options);
  }

  /**
   * Refreshes the current authentication session and issues new tokens.
   *
   * @param {RequestOptions} options - Additional request options.
   * @returns A fresh authentication response with updated tokens.
   */
  public async refresh(
    options: RequestOptions = {}
  ): Promise<Auth['authenticationResponse']> {
    return this.sendRequest('post', `${this.basePath}/refresh`, options);
  }

  /**
   * Changes the authenticated user's password.
   *
   * @param {Object} request - The change-password payload (e.g., current and new password).
   * @param {RequestOptions} options - Additional request options.
   * @returns An updated authentication response after the password change.
   */
  public async changePassword(
    request: Auth['changePasswordRequest'],
    options: RequestOptions = {}
  ): Promise<Auth['authenticationResponse']> {
    return this.sendRequest('post', `${this.basePath}/change-password`, {
      ...options,
      body: request
    });
  }

  /**
   * Exchanges a third-party or external token for an application authentication token.
   *
   * @param {Object} request - The token exchange payload (e.g., an OAuth code or external token).
   * @param {RequestOptions} options - Additional request options.
   * @returns An authentication response containing the issued application tokens.
   */
  public async exchangeToken(
    request: Auth['exchangeTokenRequest'],
    options: RequestOptions = {}
  ): Promise<Auth['authenticationResponse']> {
    return this.sendRequest('post', `${this.basePath}/exchange-token`, {
      ...options,
      body: request
    });
  }

  /**
   * Retrieves the identity of the currently authenticated user.
   *
   * @param {RequestOptions} options - Additional request options.
   * @returns The identity object for the authenticated user.
   */
  public async me(options: RequestOptions = {}): Promise<Auth['identity']> {
    return this.sendRequest('get', `${this.basePath}/me`, options);
  }
}
