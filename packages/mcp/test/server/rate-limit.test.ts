import {
  configOverrides,
  createLogger,
  ErrorCode,
  McpError,
  Memory
} from '@appweaver/common';
import { define } from '@appweaver/core';
import { InMemory } from '@appweaver/core/drivers';
import { resetContext } from '@appweaver/testing';
import { checkRateLimit } from '../../server/rate-limit';
import { admin, user } from '../fixtures/mcp-app';

const logger = createLogger('mcp');

describe('rate-limit', () => {
  let memory: InMemory;

  beforeEach(() => {
    resetContext();
    memory = new InMemory();
    define(memory, Memory);
    configOverrides.MCP_RATE_LIMIT_ENABLED = true;
    configOverrides.MCP_RATE_LIMIT_MAX = 2;
    configOverrides.MCP_RATE_LIMIT_WINDOW = 60_000;
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:15.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('checkRateLimit', () => {
    test('limits the calls of each user in the window', async () => {
      await checkRateLimit(user as never);
      await checkRateLimit(user as never);
      const error = await checkRateLimit(user as never).catch((e) => e);

      expect(error).toBeInstanceOf(McpError);
      expect(error).toMatchObject({
        code: ErrorCode.McpRateLimited,
        details: { limit: 2, retryAfter: 45 }
      });
      await expect(checkRateLimit(admin as never)).resolves.toBeUndefined();

      jest.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));
      await expect(checkRateLimit(user as never)).resolves.toBeUndefined();
    });

    test('counts the concurrent calls of a user one after another', async () => {
      const results = await Promise.allSettled(
        [1, 2, 3, 4].map(() => checkRateLimit(user as never))
      );

      expect(results.map((r) => r.status)).toEqual([
        'fulfilled',
        'fulfilled',
        'rejected',
        'rejected'
      ]);
    });

    test('counts neither the anonymous calls nor any call while disabled', async () => {
      for (let i = 0; i < 3; i++) {
        await checkRateLimit(null);
      }
      configOverrides.MCP_RATE_LIMIT_ENABLED = false;
      for (let i = 0; i < 3; i++) {
        await checkRateLimit(user as never);
      }

      expect(await memory.keys('mcp:*')).toEqual([]);
    });

    test('lets the calls through when the store fails', async () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      jest.spyOn(memory, 'get').mockRejectedValue(new Error('down'));

      for (let i = 0; i < 3; i++) {
        await checkRateLimit(user as never);
      }

      expect(warn).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'MCP rate limit store failed, call allowed'
      );
    });
  });
});
