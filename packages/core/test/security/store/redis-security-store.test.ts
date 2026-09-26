import { makeHash, Redis } from '@appweaver/common';
import { define } from '../../../context';
import { InMemory } from '../../../memory/in-memory';
import { RedisSecurityStore } from '../../../security/store/redis-security-store';
import { resetContext } from '../../fixtures/context-fixture';

describe('redis-security-store', () => {
  let memory: InMemory;
  let store: RedisSecurityStore;

  const tokenKey = (purpose: string, token: string) =>
    `security:ott:${purpose}:${makeHash(token)}`;

  beforeEach(() => {
    resetContext();
    // The in-memory implementation shares the Redis provider contract
    memory = new InMemory();
    define(memory, Redis as any);
    store = new RedisSecurityStore();
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
        memory.getValue(tokenKey('verifyEmail', token))
      ).resolves.toEqual({ userId: 7 });
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
      expect(rejected.reason).toMatchObject({ statusCode: 401 });
    });
  });
});
