// An in-memory Redis, running the Lua script of the lock too
jest.mock('ioredis', () => {
  const RedisMock = jest.requireActual('ioredis-mock');
  return { __esModule: true, Redis: RedisMock, default: RedisMock };
});

import { testMemoryContract } from '@appweaver/testing';
import { RedisMemory } from '../redis-memory';

testMemoryContract('RedisMemory', () => new RedisMemory());
