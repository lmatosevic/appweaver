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

    test('generates a different token on every call', async () => {
      const first = await store.generateOneTimeToken('verifyEmail', {}, 1000);
      const second = await store.generateOneTimeToken('verifyEmail', {}, 1000);

      expect(first).not.toBe(second);
    });
  });

  describe('useOneTimeToken', () => {
    const validToken = {
      id: 10,
      data: { userId: 7 },
      expiresAt: new Date(Date.now() + 60_000)
    };

    test('returns the stored payload and consumes the token', async () => {
      db.setResult('OneTimeToken', 'findFirst', validToken);

      await expect(
        store.useOneTimeToken('token', 'verifyEmail')
      ).resolves.toEqual({ userId: 7 });

      expect(db.lastQuery('delete').args.where).toEqual({ id: 10 });
    });

    test('looks the token up by its hash and purpose', async () => {
      db.setResult('OneTimeToken', 'findFirst', validToken);

      await store.useOneTimeToken('token', 'verifyEmail');

      expect(db.queries[0].args.where).toEqual({
        purpose: 'verifyEmail',
        tokenHash: makeHash('token')
      });
    });

    test('rejects an unknown token', async () => {
      db.setResult('OneTimeToken', 'findFirst', null);

      await expect(
        store.useOneTimeToken('token', 'verifyEmail')
      ).rejects.toThrow('Invalid or expired token provided');
    });

    test('rejects and removes an expired token', async () => {
      db.setResult('OneTimeToken', 'findFirst', {
        id: 11,
        data: {},
        expiresAt: new Date(Date.now() - 1000)
      });

      await expect(
        store.useOneTimeToken('token', 'verifyEmail')
      ).rejects.toBeInstanceOf(HttpError);

      expect(db.lastQuery('delete').args.where).toEqual({ id: 11 });
    });

    test('rejects a token whose content fails validation', async () => {
      db.setResult('OneTimeToken', 'findFirst', validToken);

      await expect(
        store.useOneTimeToken('token', 'verifyEmail', () => ({
          valid: false,
          message: 'Token content mismatch'
        }))
      ).rejects.toThrow('Token content mismatch');
    });

    test('keeps a token that fails validation unconsumed', async () => {
      db.setResult('OneTimeToken', 'findFirst', validToken);

      await expect(
        store.useOneTimeToken('token', 'verifyEmail', () => ({
          valid: false,
          message: 'Token content mismatch'
        }))
      ).rejects.toThrow();

      expect(db.queries.some((query) => query.method === 'delete')).toBe(false);
    });

    test('consumes a token that passes validation', async () => {
      db.setResult('OneTimeToken', 'findFirst', validToken);

      await expect(
        store.useOneTimeToken('token', 'verifyEmail', () => ({
          valid: true,
          message: 'OK'
        }))
      ).resolves.toEqual({ userId: 7 });

      expect(db.lastQuery('delete')).toBeDefined();
    });
  });
});
