import {
  generateToken,
  makeHash,
  Redis,
  SecurityStore,
  ValidationResult
} from '@appweaver/common';
import { inject } from '../../context';
import { HttpError } from '../../errors';

const SECURITY_OTT_KEY = 'security:ott';

export class RedisSecurityStore extends SecurityStore {
  /** @internal */
  private readonly _redis = inject(Redis);

  /**
   * Generates a one-time-use token for the provided authenticated user.
   *
   * @param {string} purpose - The purpose for which the token is generated.
   * @param {AuthUser} data - The data to store for generated token. (Will be retrieved on token usage)
   * @param {number} ttl - The time-to-live for the token in milliseconds.
   * @return {Promise<string>} A promise that resolves to the generated one-time token.
   */
  public async generateOneTimeToken<T = any>(
    purpose: string,
    data: T,
    ttl: number
  ): Promise<string> {
    const token = generateToken('bytes', 64);

    await this._redis.putValue(
      `${SECURITY_OTT_KEY}:${purpose}:${makeHash(token)}`,
      data,
      ttl
    );

    return token;
  }

  /**
   * Consumes a one-time token for a specific purpose. Retrieves the associated
   * value from the token if it is valid and then invalidates the token by removing it.
   *
   * @param {string} token - The one-time token to be consumed.
   * @param {string} purpose - The intended purpose of the one-time token.
   * @param {(value: any) => boolean} [validateContent] - The optional function used to check if token content is valid.
   * @return A promise resolving to the value associated with the token. The resolved type defaults to `any` but can
   * be specified using generics.
   * @throws {HttpError} - Throws an error if the token is invalid or expired and if `validateContent` function is
   * provided it throws error if this functions returns false `valid` property value.
   */
  public async useOneTimeToken<T = any>(
    token: string,
    purpose: string,
    validateContent?: (value: T) => ValidationResult
  ): Promise<T> {
    const tokenKey = `${SECURITY_OTT_KEY}:${purpose}:${makeHash(token)}`;
    const value = await this._redis.getValue<T>(tokenKey);

    if (value === null) {
      throw new HttpError('Invalid or expired token provided', 401);
    }

    if (validateContent) {
      const result = validateContent(value);
      if (!result.valid) {
        throw new HttpError(result.message, 401);
      }
    }

    await this._redis.removeValue(tokenKey);

    return value;
  }
}
