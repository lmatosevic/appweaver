import fastifyRateLimit from '@fastify/rate-limit';
import type { Redis as RedisClient, RedisOptions } from 'ioredis';
import { ErrorCode, Memory, RequestError } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { Server } from '../types/server';
import { rateLimitConfig, RateLimitStore } from './server-config';

/**
 * Registers the global rate limiter, counting in the Redis connection of the
 * `Memory` provider when it has one.
 */
export function registerRateLimit(server: Server): void {
  const redisClient =
    rateLimitConfig.STORE === RateLimitStore.Auto
      ? inject<Memory<RedisOptions, RedisClient>>(Memory).createClient({
          connectionName: 'rate-limit',
          connectTimeout: 500,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false
        })
      : undefined;

  if (redisClient) {
    server.addHook('onClose', async () => redisClient.disconnect());
  }

  // A secure route takes RATE_LIMIT_SECURE_SKIP_ON_ERROR, before the plugin reads it
  server.addHook('onRoute', (route) => {
    const rateLimit = route.config?.rateLimit;
    if (rateLimit && rateLimit.secure && rateLimit.skipOnError === undefined) {
      route.config = {
        ...route.config,
        rateLimit: {
          ...rateLimit,
          skipOnError: rateLimitConfig.SECURE_SKIP_ON_ERROR
        }
      };
    }
  });

  server.register(fastifyRateLimit, {
    max: rateLimitConfig.MAX,
    timeWindow: rateLimitConfig.WINDOW,
    allowList: rateLimitConfig.ALLOW_LIST,
    skipOnError: rateLimitConfig.SKIP_ON_ERROR,
    nameSpace: 'rate-limit:',
    redis: redisClient,
    onExceeded: (request, key) =>
      request.log.debug({ key, url: request.url }, 'Rate limit exceeded'),
    errorResponseBuilder: (_, context) =>
      new RequestError(
        ErrorCode.RateLimited,
        `Rate limit exceeded, retry in ${context.after}`,
        { retryAfter: Math.ceil(context.ttl / 1000) }
      )
  });
}
