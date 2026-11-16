// An in-memory Redis, delivering the messages of its pub/sub between the clients
jest.mock('ioredis', () => {
  const RedisMock = jest.requireActual('ioredis-mock');
  return {
    ...jest.requireActual('ioredis'),
    __esModule: true,
    Redis: RedisMock,
    default: RedisMock
  };
});

import { testPubSubContract } from '@appweaver/testing';
import { RedisPubSub } from '../redis-pubsub';

testPubSubContract('RedisPubSub', () => new RedisPubSub());
