import {
  AuthUser,
  createLogger,
  ErrorCode,
  McpError,
  Memory
} from '@appweaver/common';
import { inject } from '@appweaver/core';
import { mcpRateLimitConfig } from '../config';

const logger = createLogger('mcp');

/** The last count of each key, so the counts of a key are updated one after another in the process. */
const pending = new Map<string, Promise<unknown>>();

/**
 * Counts a tool call of a user in the fixed window of `mcp.rateLimit`, stored in the `Memory` provider. The anonymous
 * calls are not counted. Only the concurrent calls of a user on several instances may exceed the limit, and a failing
 * store lets the calls through.
 *
 * @param {AuthUser | null} user - The user of the call, null when anonymous.
 * @return {Promise<void>} Resolves when the call is allowed.
 * @throws {McpError} `MCP_RATE_LIMITED` when the user made `mcp.rateLimit.max` calls in the window.
 */
export async function checkRateLimit(user: AuthUser | null): Promise<void> {
  if (!mcpRateLimitConfig.ENABLED || !user) {
    return;
  }
  const { MAX: limit, WINDOW: window } = mcpRateLimitConfig;
  const now = Date.now();
  const start = now - (now % window);
  const remaining = start + window - now;
  const key = `mcp:rate-limit:${user.id}:${start}`;
  const count = await serialize(key, () => increment(key, limit, remaining));
  if (count > limit) {
    const retryAfter = Math.ceil(remaining / 1000);
    throw new McpError(
      ErrorCode.McpRateLimited,
      `Rate limit of ${limit} tool calls exceeded, retry in ${retryAfter} seconds`,
      { limit, retryAfter }
    );
  }
}

/** Increments the count of a key, kept until the end of its window, or 0 when the store fails. */
async function increment(
  key: string,
  limit: number,
  ttl: number
): Promise<number> {
  try {
    const memory = inject(Memory);
    const count = ((await memory.get<number>(key)) ?? 0) + 1;
    // Past the limit the stored count needs no update
    if (count <= limit) {
      await memory.set(key, count, ttl);
    }
    return count;
  } catch (error) {
    logger.warn({ err: error }, 'MCP rate limit store failed, call allowed');
    return 0;
  }
}

function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (pending.get(key) ?? Promise.resolve()).then(fn);
  pending.set(key, next);
  void next.finally(() => {
    if (pending.get(key) === next) {
      pending.delete(key);
    }
  });
  return next;
}
