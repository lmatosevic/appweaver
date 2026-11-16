jest.mock('ioredis', () => {
  const RedisMock = jest.requireActual('ioredis-mock');
  return {
    ...jest.requireActual('ioredis'),
    __esModule: true,
    Redis: RedisMock,
    default: RedisMock
  };
});

import { configOverrides } from '@appweaver/common';
import { RedisPubSub } from '../redis-pubsub';

const wait = () => new Promise((resolve) => setTimeout(resolve, 30));

describe('RedisPubSub', () => {
  let pubsub: RedisPubSub;

  beforeEach(() => {
    pubsub = new RedisPubSub();
  });

  afterEach(async () => {
    await pubsub.onDestroy();
    delete configOverrides.PUBSUB_REDIS_CHANNEL_PREFIX;
  });

  test('publishes to the prefixed Redis channel', async () => {
    configOverrides.PUBSUB_REDIS_CHANNEL_PREFIX = 'app:';
    const messages: unknown[] = [];
    await pubsub.subscribe('orders', (message) => {
      messages.push(message);
    });

    await pubsub.publish('orders', undefined);
    await wait();

    expect(messages).toEqual([null]);
    expect((pubsub as any)._subscriber.options.connectionName).toBe(
      'appweaver-subscriber'
    );
  });

  test('skips a message that is not JSON', async () => {
    const messages: unknown[] = [];
    await pubsub.subscribe('orders', (message) => {
      messages.push(message);
    });

    (pubsub as any).dispatch('appweaver:orders', 'not json');
    (pubsub as any).dispatch('appweaver:orders', '{"id":1}');
    await wait();

    expect(messages).toEqual([{ id: 1 }]);
  });

  test('unsubscribes the Redis channel with its last subscription', async () => {
    const first = await pubsub.subscribe('orders', () => undefined);
    const second = await pubsub.subscribe('orders', () => undefined);
    const unsubscribe = jest.spyOn((pubsub as any)._subscriber, 'unsubscribe');

    await pubsub.unsubscribe(first);
    expect(unsubscribe).not.toHaveBeenCalled();
    await pubsub.unsubscribe(second);
    expect(unsubscribe).toHaveBeenCalledWith('appweaver:orders');
  });

  test('disconnects a client failing to quit', async () => {
    await pubsub.publish('orders', 1);
    const publisher = (pubsub as any)._publisher;
    jest.spyOn(publisher, 'quit').mockRejectedValue(new Error('down'));
    const disconnect = jest.spyOn(publisher, 'disconnect');

    await pubsub.onDestroy();

    expect(disconnect).toHaveBeenCalled();
  });

  test('logs the errors of a client', async () => {
    await pubsub.publish('orders', 1);

    expect(() =>
      (pubsub as any)._publisher.emit('error', new Error('down'))
    ).not.toThrow();
  });
});
