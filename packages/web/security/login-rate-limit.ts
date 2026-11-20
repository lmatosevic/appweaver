import { FastifyRequest } from 'fastify';
import {
  createLogger,
  ErrorCode,
  Memory,
  MemoryError,
  RequestError
} from '@appweaver/common';
import { inject } from '@appweaver/core';
import { rateLimitConfig } from '../server/server-config';

const logger = createLogger('security');

/** The password sign-ins of an IP address per window, shared by every route signing a user in with a password. */
export const LOGIN_RATE_LIMIT = { max: 12, window: 60000 };

/** The counts of the window of the process, without a `Memory` provider. */
const local = { start: 0, counts: new Map<string, number>() };

/** The last count of each key, so the counts of a key are updated one after another in the process. */
const pending = new Map<string, Promise<number>>();

/**
 * Counts a password sign-in of the IP address of a request in the fixed window of `LOGIN_RATE_LIMIT`, stored in the
 * `Memory` provider so every instance and every route signing a user in with a password (`POST /auth/login`, the
 * sign-in form of the MCP clients) shares the count. Like a secure route of the rate limiter, it fails while the store
 * fails, unless `rateLimit.secureSkipOnError`, and counts nothing without `rateLimit.enabled` or for an address of
 * `rateLimit.allowList`. Only the concurrent sign-ins on several instances may exceed the limit.
 *
 * @param {FastifyRequest} request - The request signing a user in.
 * @return {Promise<void>} Resolves when the sign-in is allowed.
 * @throws {RequestError} `RATE_LIMITED` when the address made `LOGIN_RATE_LIMIT.max` sign-ins in the window.
 * @throws {MemoryError} `MEMORY_UNAVAILABLE` when the store fails.
 */
export async function checkLoginRateLimit(
  request: FastifyRequest
): Promise<void> {
  if (
    !rateLimitConfig.ENABLED ||
    rateLimitConfig.ALLOW_LIST?.includes(request.ip)
  ) {
    return;
  }
  const { max, window } = LOGIN_RATE_LIMIT;
  const now = Date.now();
  const start = now - (now % window);
  const remaining = start + window - now;
  const retryAfter = Math.ceil(remaining / 1000);
  const key = `auth:login-limit:${request.ip}:${start}`;

  let count: number;
  try {
    count = await serialize(key, () => increment(key, start, remaining));
  } catch (error) {
    if (rateLimitConfig.SECURE_SKIP_ON_ERROR) {
      logger.warn({ err: error }, 'Login rate limit store failed, allowed');
      return;
    }
    throw new MemoryError(
      ErrorCode.MemoryUnavailable,
      'The rate limit of the sign-ins is unavailable',
      { retryAfter }
    );
  }
  if (count > max) {
    throw new RequestError(
      ErrorCode.RateLimited,
      `Rate limit exceeded, retry in ${retryAfter} seconds`,
      { retryAfter }
    );
  }
}

/** Increments the count of a key, kept until the end of its window. */
async function increment(
  key: string,
  start: number,
  ttl: number
): Promise<number> {
  const memory = inject(Memory, false);
  if (!memory) {
    if (local.start !== start) {
      local.start = start;
      local.counts.clear();
    }
    const count = (local.counts.get(key) ?? 0) + 1;
    local.counts.set(key, count);
    return count;
  }
  const count = ((await memory.get<number>(key)) ?? 0) + 1;
  // Past the limit the stored count needs no update
  if (count <= LOGIN_RATE_LIMIT.max) {
    await memory.set(key, count, ttl);
  }
  return count;
}

function serialize(key: string, fn: () => Promise<number>): Promise<number> {
  const next = (pending.get(key) ?? Promise.resolve(0)).then(fn, fn);
  pending.set(key, next);
  void next
    .finally(() => {
      if (pending.get(key) === next) {
        pending.delete(key);
      }
    })
    .catch(() => undefined);
  return next;
}
