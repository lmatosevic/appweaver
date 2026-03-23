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

    await this._db.client().oneTimeToken.create({
      data: {
        tokenHash: makeHash(token),
        purpose,
        expiresAt: new Date(Date.now() + ttl),
        data: data as any
      }
    });

    return token;
  }

  public async useOneTimeToken<T = any>(
    token: string,
    purpose: string,
    validateContent?: (value: T) => ValidationResult
  ): Promise<T> {
    const oneTimeToken = await this._db.client().oneTimeToken.findFirst({
      where: {
        purpose,
        tokenHash: makeHash(token)
      }
    });

    if (
      oneTimeToken === null ||
      oneTimeToken.expiresAt.getTime() < Date.now()
    ) {
      if (oneTimeToken) {
        await this.removeOneTimeToken(oneTimeToken.id);
      }
      throw new HttpError('Invalid or expired token provided', 401);
    }

    const data = oneTimeToken.data as T;

    if (validateContent) {
      const result = validateContent(data);
      if (!result.valid) {
        throw new HttpError(result.message, 401);
      }
    }

    await this.removeOneTimeToken(oneTimeToken.id);

    return data;
  }

  /** @internal */
  private async removeOneTimeToken(id: number): Promise<void> {
    await this._db.client().oneTimeToken.delete({ where: { id } });
  }
}
