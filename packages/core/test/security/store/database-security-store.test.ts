import { Database, makeHash } from '@appweaver/common';
import { define } from '../../../context';
import { HttpError } from '../../../errors';
import { DatabaseSecurityStore } from '../../../security/store/database-security-store';
import { resetContext } from '../../fixtures/context-fixture';
import {
  createDatabaseStub,
  DatabaseStub
} from '../../fixtures/database-fixture';

describe('database-security-store', () => {
  let db: DatabaseStub;
  let store: DatabaseSecurityStore;

  beforeEach(() => {
    resetContext();
    db = createDatabaseStub(['OneTimeToken']);
    define(db.database, Database as any);
    store = new DatabaseSecurityStore();
  });

  afterAll(() => {
    resetContext();
  });

  describe('generateOneTimeToken', () => {
    test('returns a token and stores only its hash', async () => {
      const token = await store.generateOneTimeToken(
        'verifyEmail',
        { id: 1 },
        1000
      );

      expect(token).toMatch(/^[\da-f]{64}$/);

      const stored = db.lastQuery('create').args.data;
      expect(stored.tokenHash).toBe(makeHash(token));
      expect(stored.tokenHash).not.toBe(token);
    });

    test('stores the purpose and the payload', async () => {
      await store.generateOneTimeToken('verifyEmail', { userId: 7 }, 1000);

      expect(db.lastQuery('create').args.data).toMatchObject({
        purpose: 'verifyEmail',
        data: { userId: 7 }
      });
    });

    test('sets the expiration from the given ttl', async () => {
      const before = Date.now();

      await store.generateOneTimeToken('verifyEmail', {}, 60_000);

      const expiresAt = db.lastQuery('create').args.data.expiresAt as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    });

    test('deletes the expired tokens before storing a new one', async () => {
      const before = Date.now();

      await store.generateOneTimeToken('verifyEmail', {}, 1000);

      const methods = db.queries.map((query) => query.method);
      expect(methods).toEqual(['deleteMany', 'create']);

      const expiredBefore = db.lastQuery('deleteMany').args.where.expiresAt
        .lt as Date;
      expect(expiredBefore.getTime()).toBeGreaterThanOrEqual(before);
      expect(expiredBefore.getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('generates a different token on every call', async () => {
      const first = await store.generateOneTimeToken('verifyEmail', {}, 1000);
      const second = await store.generateOneTimeToken('verifyEmail', {}, 1000);

      expect(first).not.toBe(second);
    });
  });

  describe('useOneTimeToken', () => {
    const validToken = {
      id: 10,
      purpose: 'verifyEmail',
      data: { userId: 7 },
      expiresAt: new Date(Date.now() + 60_000)
    };

    beforeEach(() => {
      db.setResult('OneTimeToken', 'findUnique', validToken);
      db.setResult('OneTimeToken', 'deleteMany', { count: 1 });
    });

    test('returns the stored payload and consumes the token', async () => {
      await expect(
        store.useOneTimeToken('token', 'verifyEmail')
      ).resolves.toEqual({ userId: 7 });

      expect(db.lastQuery('deleteMany').args.where).toEqual({ id: 10 });
    });

    test('looks the token up by its hash', async () => {
      await store.useOneTimeToken('token', 'verifyEmail');

      expect(db.lastQuery('findUnique').args.where).toEqual({
        tokenHash: makeHash('token')
      });
    });

    test('rejects an unknown token', async () => {
      db.setResult('OneTimeToken', 'findUnique', null);

      await expect(
        store.useOneTimeToken('token', 'verifyEmail')
      ).rejects.toThrow('Invalid or expired token provided');
    });

    test('rejects a token issued for another purpose and keeps it', async () => {
      await expect(
        store.useOneTimeToken('token', 'passwordReset')
      ).rejects.toThrow('Invalid or expired token provided');

      expect(db.queries.some((query) => query.method === 'deleteMany')).toBe(
        false
      );
    });

    test('rejects an expired token', async () => {
      db.setResult('OneTimeToken', 'findUnique', {
        ...validToken,
        expiresAt: new Date(Date.now() - 1000)
      });

      await expect(
        store.useOneTimeToken('token', 'verifyEmail')
      ).rejects.toBeInstanceOf(HttpError);
    });

    test('rejects a token whose content fails validation', async () => {
      await expect(
        store.useOneTimeToken('token', 'verifyEmail', () => ({
          valid: false,
          message: 'Token content mismatch'
        }))
      ).rejects.toThrow('Token content mismatch');
    });

    test('keeps a token that fails validation for another attempt', async () => {
      await expect(
        store.useOneTimeToken('token', 'verifyEmail', () => ({
          valid: false,
          message: 'Token content mismatch'
        }))
      ).rejects.toThrow();

      expect(db.queries.some((query) => query.method === 'deleteMany')).toBe(
        false
      );
    });

    test('consumes a token that passes validation', async () => {
      await expect(
        store.useOneTimeToken('token', 'verifyEmail', () => ({
          valid: true,
          message: 'OK'
        }))
      ).resolves.toEqual({ userId: 7 });

      expect(db.lastQuery('deleteMany')).toBeDefined();
    });

    test('rejects a token already consumed by a concurrent use', async () => {
      db.setResult('OneTimeToken', 'deleteMany', { count: 0 });

      await expect(
        store.useOneTimeToken('token', 'verifyEmail')
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid or expired token provided'
      });
    });
  });
});
