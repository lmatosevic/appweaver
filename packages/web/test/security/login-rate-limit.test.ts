import {
  configOverrides,
  createLogger,
  ErrorCode,
  Memory
} from '@appweaver/common';
import { define } from '@appweaver/core';
import { InMemory } from '@appweaver/core/drivers';
import { resetContext } from '@appweaver/testing';
import {
  checkLoginRateLimit,
  LOGIN_RATE_LIMIT
} from '../../security/login-rate-limit';

describe('login-rate-limit', () => {
  const request = (ip: string = '10.0.0.1') => ({ ip }) as any;

  /** Signs in from an address until the limit, returning the error of the next sign-in. */
  const exceed = async (ip?: string) => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.max; i++) {
      await checkLoginRateLimit(request(ip));
    }
    return checkLoginRateLimit(request(ip)).catch((error) => error);
  };

  beforeEach(() => {
    resetContext();
    define(new InMemory(), Memory);
    // The middle of a window, so every count of a test falls in the same one
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_030_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('checkLoginRateLimit', () => {
    test('allows the sign-ins of an address up to the limit of the window', async () => {
      const error = await exceed();

      expect(error).toMatchObject({
        code: ErrorCode.RateLimited,
        details: { retryAfter: 30 }
      });
    });

    test('counts each address on its own', async () => {
      await exceed('10.0.0.1');

      await expect(checkLoginRateLimit(request('10.0.0.2'))).resolves.toBe(
        undefined
      );
    });

    test('starts again in the next window', async () => {
      await exceed();
      jest.spyOn(Date, 'now').mockReturnValue(1_800_000_060_000);

      await expect(checkLoginRateLimit(request())).resolves.toBe(undefined);
    });

    test('counts nothing while the rate limit is disabled or for an allowed address', async () => {
      configOverrides.RATE_LIMIT_ENABLED = false;
      await expect(exceed()).resolves.toBe(undefined);

      configOverrides.RATE_LIMIT_ENABLED = true;
      configOverrides.RATE_LIMIT_ALLOW_LIST = ['10.0.0.9'];
      await expect(exceed('10.0.0.9')).resolves.toBe(undefined);
    });

    test('fails while the store fails, unless the secure routes skip it', async () => {
      const memory = new InMemory();
      jest.spyOn(memory, 'get').mockRejectedValue(new Error('down'));
      define(memory, Memory, 'override');
      const warn = jest
        .spyOn(createLogger('security'), 'warn')
        .mockImplementation();

      await expect(checkLoginRateLimit(request())).rejects.toMatchObject({
        code: ErrorCode.MemoryUnavailable,
        details: { retryAfter: 30 }
      });

      configOverrides.RATE_LIMIT_SECURE_SKIP_ON_ERROR = true;
      await expect(checkLoginRateLimit(request())).resolves.toBe(undefined);
      expect(warn).toHaveBeenCalled();
    });

    test('counts in the process without a Memory provider', async () => {
      resetContext();

      expect(await exceed()).toMatchObject({ code: ErrorCode.RateLimited });
    });
  });
});
