import { BaseModule, RequestOptions } from './base-module';
import { BaseClientInterface } from '../base-client-interface';
import { TWO_FACTOR_OPERATIONS, TWO_FACTOR_TYPES } from '../../constants';

export type TwoFactorType = Record<(typeof TWO_FACTOR_TYPES)[number], unknown>;

export type TwoFactorInterface = {
  [K in keyof typeof TWO_FACTOR_OPERATIONS]: (...args: any[]) => Promise<any>;
};

export class TwoFactorClient<TwoFactor extends TwoFactorType>
  extends BaseModule
  implements TwoFactorInterface
{
  constructor(
    client: BaseClientInterface,
    public readonly basePath: string
  ) {
    super(client);
  }

  /**
   * Sends a 2FA challenge to the signed-in user, with the token of the `2fa` scope the login returned: a code by email
   * or SMS, or none for the authenticator app.
   *
   * @param {Object} request - The method, the default one of the user when missing, and the purpose of the challenge.
   * @param {RequestOptions} options - Additional request options.
   * @return The challenge, with the masked destination of the code and the methods of the user.
   */
  public async challenge(
    request: TwoFactor['challengeRequest'] = {},
    options: RequestOptions = {}
  ): Promise<TwoFactor['challengeResponse']> {
    return this.sendRequest('post', `${this.basePath}/challenge`, {
      ...options,
      body: request
    });
  }

  /**
   * Verifies the code of a 2FA challenge, returning the one-time token exchanged by `auth.exchangeToken`.
   *
   * @param {Object} request - The id of the challenge and the code.
   * @param {RequestOptions} options - Additional request options.
   * @return The one-time token and its expiration time.
   */
  public async verify(
    request: TwoFactor['verifyRequest'],
    options: RequestOptions = {}
  ): Promise<TwoFactor['verifyResponse']> {
    return this.sendRequest('post', `${this.basePath}/verify`, {
      ...options,
      body: request
    });
  }

  /**
   * Lists the enabled 2FA methods of the signed-in user and the ones they may enable.
   *
   * @param {RequestOptions} options - Additional request options.
   * @return The enabled and the available methods.
   */
  public async listMethods(
    options: RequestOptions = {}
  ): Promise<TwoFactor['methodsResponse']> {
    return this.sendRequest('get', `${this.basePath}/methods`, options);
  }

  /**
   * Enables the email or SMS method of the signed-in user.
   *
   * @param {Object} request - The method to enable.
   * @param {RequestOptions} options - Additional request options.
   * @return The enabled and the available methods.
   */
  public async enableMethod(
    request: TwoFactor['enableMethodRequest'],
    options: RequestOptions = {}
  ): Promise<TwoFactor['methodsResponse']> {
    return this.sendRequest('post', `${this.basePath}/methods`, {
      ...options,
      body: request
    });
  }

  /**
   * Orders the 2FA methods of the signed-in user, the first becoming the default.
   *
   * @param {Object} request - Every enabled method in the new order.
   * @param {RequestOptions} options - Additional request options.
   * @return The enabled and the available methods.
   */
  public async orderMethods(
    request: TwoFactor['orderMethodsRequest'],
    options: RequestOptions = {}
  ): Promise<TwoFactor['methodsResponse']> {
    return this.sendRequest('put', `${this.basePath}/methods/order`, {
      ...options,
      body: request
    });
  }

  /**
   * Disables a 2FA method of the signed-in user, confirmed by their password.
   *
   * @param {string} method - The method to disable.
   * @param {Object} request - The password of the user, required when the user has one.
   * @param {RequestOptions} options - Additional request options.
   * @return The enabled and the available methods.
   */
  public async disableMethod(
    method: string,
    request: TwoFactor['disableMethodRequest'] = {},
    options: RequestOptions = {}
  ): Promise<TwoFactor['methodsResponse']> {
    return this.sendRequest('delete', `${this.basePath}/methods/{method}`, {
      ...options,
      body: request,
      params: {
        ...(options.params ?? {}),
        path: {
          method
        }
      }
    });
  }

  /**
   * Starts the setup of an authenticator app, returning the secret and its `otpauth://` URI for a QR code.
   *
   * @param {RequestOptions} options - Additional request options.
   * @return The secret, its URI and the time to confirm the setup.
   */
  public async setupTotp(
    options: RequestOptions = {}
  ): Promise<TwoFactor['totpSetupResponse']> {
    return this.sendRequest('post', `${this.basePath}/totp/setup`, options);
  }

  /**
   * Confirms the setup of an authenticator app with a code of the app, enabling the method.
   *
   * @param {Object} request - The code of the authenticator app.
   * @param {RequestOptions} options - Additional request options.
   * @return The enabled and the available methods.
   */
  public async confirmTotp(
    request: TwoFactor['totpConfirmRequest'],
    options: RequestOptions = {}
  ): Promise<TwoFactor['methodsResponse']> {
    return this.sendRequest('post', `${this.basePath}/totp/confirm`, {
      ...options,
      body: request
    });
  }
}
