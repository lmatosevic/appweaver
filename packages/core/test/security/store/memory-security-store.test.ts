import { ErrorCode, makeHash, Memory } from '@appweaver/common';
import { define } from '../../../context/dependency-injection';
import { InMemory } from '../../../memory/in-memory';
import { MemorySecurityStore } from '../../../security/store/memory-security-store';
import { resetContext } from '../../fixtures/context-fixture';

describe('memory-security-store', () => {
  let memory: InMemory;
  let store: MemorySecurityStore;

  const tokenKey = (purpose: string, token: string) =>
    `security:ott:${purpose}:${makeHash(token)}`;

  beforeEach(() => {
    resetContext();
    memory = new InMemory();
    define(memory, Memory);
    store = new MemorySecurityStore();
  });

  afterAll(() => {
    resetContext();
  });

  describe('generateOneTimeToken', () => {
    test('stores the payload under the hash of the token', async () => {
      const token = await store.generateOneTimeToken(
        'verifyEmail',
        { userId: 7 },
        1000
      );

      expect(token).toMatch(/^[\da-f]{64}$/);
      await expect(
        memory.get(tokenKey('verifyEmail', token))
      ).resolves.toMatchObject({
        data: { userId: 7 },
        expiresAt: expect.any(Number)
      });
    });

    test('expires the token after the given ttl', async () => {
      const token = await store.generateOneTimeToken('verifyEmail', {}, 20);

      await new Promise((resolve) => setTimeout(resolve, 40));

      await expect(store.useOneTimeToken(token, 'verifyEmail')).rejects.toThrow(
        'Invalid or expired token provided'
      );
    });
  });

  describe('useOneTimeToken', () => {
    test('returns the stored payload and consumes the token', async () => {
      const token = await store.generateOneTimeToken(
        'verifyEmail',
        { userId: 7 },
        60_000
      );

      await expect(
        store.useOneTimeToken(token, 'verifyEmail')
      ).resolves.toEqual({ userId: 7 });
      await expect(store.useOneTimeToken(token, 'verifyEmail')).rejects.toThrow(
        'Invalid or expired token provided'
      );
    });

    test('rejects a token issued for another purpose', async () => {
      const token = await store.generateOneTimeToken('verifyEmail', {}, 60_000);

      await expect(
        store.useOneTimeToken(token, 'passwordReset')
      ).rejects.toThrow('Invalid or expired token provided');
    });

    test('keeps a token that fails validation for another attempt', async () => {
      const token = await store.generateOneTimeToken(
        'twoFA',
        { code: '123456' },
        60_000
      );
      const validate = (code: string) => (value: { code: string }) =>
        value.code === code
          ? { valid: true, message: 'OK' }
          : { valid: false, message: 'Invalid 2FA code provided' };

      await expect(
        store.useOneTimeToken(token, 'twoFA', validate('000000'))
      ).rejects.toThrow('Invalid 2FA code provided');
      await expect(
        store.useOneTimeToken(token, 'twoFA', validate('123456'))
      ).resolves.toEqual({ code: '123456' });
    });

    test('replaces the data of a token failing validation', async () => {
      const token = await store.generateOneTimeToken(
        'twoFA',
        { attempts: 0 },
        60_000
      );
      const fail = (value: { attempts: number }) => ({
        valid: false,
        message: 'Invalid code',
        data: { attempts: value.attempts + 1 }
      });

      await expect(store.useOneTimeToken(token, 'twoFA', fail)).rejects.toThrow(
        'Invalid code'
      );
      await expect(store.useOneTimeToken(token, 'twoFA', fail)).rejects.toThrow(
        'Invalid code'
      );
      await expect(store.useOneTimeToken(token, 'twoFA')).resolves.toEqual({
        attempts: 2
      });
    });

    test('revokes a token failing validation', async () => {
      const token = await store.generateOneTimeToken('twoFA', {}, 60_000);

      await expect(
        store.useOneTimeToken(token, 'twoFA', () => ({
          valid: false,
          message: 'Too many attempts',
          revoke: true
        }))
      ).rejects.toThrow('Too many attempts');
      await expect(store.useOneTimeToken(token, 'twoFA')).rejects.toThrow(
        'Invalid or expired token provided'
      );
    });

    test('throws the error of a failed validation', async () => {
      const token = await store.generateOneTimeToken('twoFA', {}, 60_000);
      const error = new Error('Custom');

      await expect(
        store.useOneTimeToken(token, 'twoFA', () => ({
          valid: false,
          message: 'Invalid',
          error
        }))
      ).rejects.toBe(error);
    });

    test('removes a token expiring during its validation', async () => {
      const token = await store.generateOneTimeToken('twoFA', {}, 60_000);
      const key = tokenKey('twoFA', token);
      await memory.set(key, { data: {}, expiresAt: Date.now() - 1 }, 60_000);

      await expect(
        store.useOneTimeToken(token, 'twoFA', () => ({
          valid: false,
          message: 'Invalid',
          data: {}
        }))
      ).rejects.toThrow('Invalid');
      await expect(memory.has(key)).resolves.toBe(false);
    });

    test('reads a token stored by an earlier version, holding its data alone', async () => {
      await memory.set(
        tokenKey('verifyEmail', 'legacy'),
        { userId: 7 },
        60_000
      );

      await expect(
        store.useOneTimeToken('legacy', 'verifyEmail')
      ).resolves.toEqual({ userId: 7 });
    });

    test('keeps the data of an earlier token failing validation', async () => {
      const key = tokenKey('twoFA', 'legacy');
      await memory.set(key, { attempts: 0 }, 60_000);

      await expect(
        store.useOneTimeToken('legacy', 'twoFA', () => ({
          valid: false,
          message: 'Invalid code',
          data: { attempts: 1 }
        }))
      ).rejects.toThrow('Invalid code');
      await expect(memory.get(key)).resolves.toEqual({ attempts: 0 });
    });

    test('lets only one of concurrent uses consume the token', async () => {
      const token = await store.generateOneTimeToken(
        'passwordReset',
        { userId: 7 },
        60_000
      );

      const results = await Promise.allSettled([
        store.useOneTimeToken(token, 'passwordReset'),
        store.useOneTimeToken(token, 'passwordReset')
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        'fulfilled',
        'rejected'
      ]);
      const rejected = results.find(
        (result) => result.status === 'rejected'
      ) as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({
        code: ErrorCode.AuthInvalidToken
      });
    });
  });
});
