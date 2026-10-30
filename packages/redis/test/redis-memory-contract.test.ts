// An in-memory Redis, running the Lua script of the lock too
jest.mock('ioredis', () => {
  const RedisMock = jest.requireActual('ioredis-mock');
  // The mock runs its commands without sendCommand, which the guard wraps
  RedisMock.prototype.sendCommand ??= () => undefined;
  return {
    ...jest.requireActual('ioredis'),
    __esModule: true,
    Redis: RedisMock,
    default: RedisMock
  };
});

import { testMemoryContract } from '@appweaver/testing';
import { RedisMemory } from '../redis-memory';

testMemoryContract('RedisMemory', () => new RedisMemory());
