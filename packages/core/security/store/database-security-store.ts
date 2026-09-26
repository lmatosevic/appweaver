import {
  Database,
  generateToken,
  makeHash,
  SecurityStore,
  ValidationResult
} from '@appweaver/common';
import { inject } from '../../context';
import { PrismaDatabase } from '../../database';
import { HttpError } from '../../errors';

export class DatabaseSecurityStore extends SecurityStore {
  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);

  public async generateOneTimeToken<T = any>(
    purpose: string,
    data: T,
    ttl: number
  ): Promise<string> {
    const token = generateToken('bytes', 64);
    const oneTimeTokens = this._db.client().oneTimeToken;

    // Expired tokens are removed here, so they need no scheduled cleanup
    await oneTimeTokens.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });

    await oneTimeTokens.create({
      data: {
        tokenHash: makeHash(token),
        purpose,
        data: data as any,
        expiresAt: new Date(Date.now() + ttl)
      }
    });

    return token;
  }

  public async useOneTimeToken<T = any>(
    token: string,
    purpose: string,
    validateContent?: (value: T) => ValidationResult
  ): Promise<T> {
    const oneTimeTokens = this._db.client().oneTimeToken;

    const oneTimeToken = await oneTimeTokens.findUnique({
      where: { tokenHash: makeHash(token) }
    });

    if (
      oneTimeToken === null ||
      oneTimeToken.purpose !== purpose ||
      oneTimeToken.expiresAt.getTime() < Date.now()
    ) {
      throw new HttpError('Invalid or expired token provided', 401);
    }

    const data = oneTimeToken.data as T;

    // A token failing the validation is kept, so it can be used again
    if (validateContent) {
      const result = validateContent(data);
      if (!result.valid) {
        throw new HttpError(result.message, 401);
      }
    }

    // Only the one of concurrent uses that removes the token gets its data
    const { count } = await oneTimeTokens.deleteMany({
      where: { id: oneTimeToken.id }
    });
    if (count === 0) {
      throw new HttpError('Invalid or expired token provided', 401);
    }

    return data;
  }
}
