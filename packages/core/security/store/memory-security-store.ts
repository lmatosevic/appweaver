import {
  ErrorCode,
  generateToken,
  makeHash,
  Memory,
  SecurityStore,
  TokenValidationResult,
  AuthError
} from '@appweaver/common';
import { inject } from '../../context';

const SECURITY_OTT_KEY = 'security:ott';

/** A stored token, with its expiration, so data replaced on a failed validation keeps the remaining time to live. */
type StoredToken<T> = {
  data: T;
  expiresAt: number;
};

export class MemorySecurityStore extends SecurityStore {
  /** @internal */
  private readonly _memory = inject(Memory);

  public async generateOneTimeToken<T = any>(
    purpose: string,
    data: T,
    ttl: number
  ): Promise<string> {
    const token = generateToken('bytes', 64);

    await this._memory.set(
      this.tokenKey(token, purpose),
      { data, expiresAt: Date.now() + ttl } satisfies StoredToken<T>,
      ttl
    );

    return token;
  }

  public async useOneTimeToken<T = any>(
    token: string,
    purpose: string,
    validateContent?: (value: T) => TokenValidationResult<T>
  ): Promise<T> {
    const tokenKey = this.tokenKey(token, purpose);
    const stored = await this._memory.get<StoredToken<T>>(tokenKey);

    if (stored === null) {
      throw new AuthError(
        ErrorCode.AuthInvalidToken,
        'Invalid or expired token provided'
      );
    }

    // A token failing the validation is kept, so it can be used again
    if (validateContent) {
      const result = validateContent(stored.data);
      if (!result.valid) {
        const ttl = stored.expiresAt - Date.now();
        if (result.revoke || ttl <= 0) {
          await this._memory.delete(tokenKey);
        } else if (result.data !== undefined) {
          await this._memory.set(
            tokenKey,
            { data: result.data, expiresAt: stored.expiresAt },
            ttl
          );
        }
        throw (
          result.error ??
          new AuthError(ErrorCode.AuthInvalidToken, result.message)
        );
      }
    }

    // Only the one of concurrent uses that removes the token gets its data
    const removed = await this._memory.delete(tokenKey);
    if (!removed) {
      throw new AuthError(
        ErrorCode.AuthInvalidToken,
        'Invalid or expired token provided'
      );
    }

    return stored.data;
  }

  /** @internal */
  private tokenKey(token: string, purpose: string): string {
    return `${SECURITY_OTT_KEY}:${purpose}:${makeHash(token)}`;
  }
}
