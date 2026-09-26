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

    // A token failing the validation is kept, so it can be used again
    if (validateContent) {
      const result = validateContent(value);
      if (!result.valid) {
        throw new HttpError(result.message, 401);
      }
    }

    // Only the one of concurrent uses that removes the token gets its data
    const removed = await this._redis.removeValue(tokenKey);
    if (!removed) {
      throw new HttpError('Invalid or expired token provided', 401);
    }

    return value;
  }
}
