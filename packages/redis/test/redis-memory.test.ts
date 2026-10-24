jest.mock('ioredis', () => {
  const { EventEmitter } = jest.requireActual('node:events');

  // An in-memory stand-in of the ioredis client, holding the keys in a map
  class Redis extends EventEmitter {
    static instances: Redis[] = [];
    status = 'ready';
    store = new Map<string, string>();
    connect = jest.fn(async () => {});
    quit = jest.fn(async () => 'OK');
    disconnect = jest.fn();
    ping = jest.fn(async () => 'PONG');
    memory = jest.fn(async () => 42);
    get = jest.fn(async (key: string) => this.store.get(key) ?? null);
    exists = jest.fn(async (key: string) => (this.store.has(key) ? 1 : 0));
    set = jest.fn(async (key: string, value: string, ...args: any[]) => {
      if (args.includes('NX') && this.store.has(key)) {
        return null;
      }
      this.store.set(key, value);
      return 'OK';
    });
    del = jest.fn(
      async (...keys: string[]) =>
        keys.filter((key) => this.store.delete(key)).length
    );

    constructor(public options: any) {
      super();
      Redis.instances.push(this);
    }

    scanStream() {
      const stream = new EventEmitter();
      stream.pause = () => undefined;
      stream.resume = () => undefined;
      process.nextTick(() => {
        stream.emit('data', [...this.store.keys()]);
        stream.emit('end');
      });
      return stream;
    }

    defineCommand(name: string) {
      (this as any)[name] = jest.fn(async (key: string, value: string) =>
        this.store.get(key) === value ? Number(this.store.delete(key)) : 0
      );
    }
  }

  return { Redis };
});

import { Redis as RedisClient } from 'ioredis';
import * as common from '@appweaver/common';
import { ErrorCode, logger } from '@appweaver/common';
import { RedisMemory } from '../redis-memory';

const clients = () => (RedisClient as any).instances as any[];

describe('redis-memory', () => {
  let redis: RedisMemory;
  let client: any;

  beforeEach(() => {
    clients().length = 0;
    redis = new RedisMemory();
    client = clients()[0];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (common as any).configOverrides.MEMORY_REDIS_URL;
  });

  describe('constructor', () => {
    test.each([
      [
        'redis://user:pass@cache:6380/2',
        { username: 'user', password: 'pass', host: 'cache', port: 6380, db: 2 }
      ],
      [
        'redis://secret@cache:6379',
        { password: 'secret', host: 'cache', port: 6379 }
      ],
      ['not-a-url', { host: 'localhost', port: 6379 }]
    ])('parses the connection URL %s', (url, expected) => {
      (common as any).configOverrides.MEMORY_REDIS_URL = url;

      new RedisMemory();

      expect(clients()[1].options).toMatchObject(expected);
      expect(clients()[1].options.connectionName).toBe('appweaver');
    });
  });

  describe('createClient', () => {
    test('logs only the first error of an outage, and the recovery', () => {
      const error = jest.spyOn(logger, 'error').mockImplementation();
      const info = jest.spyOn(logger, 'info').mockImplementation();

      client.emit('error', new Error('down'));
      client.emit('error', new Error('still down'));
      client.emit('ready');

      expect(error).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(
        "Redis connection 'appweaver' is restored"
      );
    });
  });

  describe('get / set', () => {
    test('stores and reads back a serialized value', async () => {
      expect(await redis.set('post', { id: 1, tags: ['a'] })).toBe(true);

      expect(await redis.get('post')).toEqual({ id: 1, tags: ['a'] });
      expect(await redis.get('missing')).toBeNull();
    });

    test('expires a value after the given TTL', async () => {
      await redis.set('post', 1, 5000);

      expect(client.set).toHaveBeenCalledWith('post', '[1]', 'PX', 5000);
    });
  });

  describe('has / delete / deleteMatching', () => {
    test('checks and deletes the keys', async () => {
      await redis.set('a', 1);
      await redis.set('b', 2);

      expect(await redis.has('a')).toBe(true);
      expect(await redis.delete('a')).toBe(true);
      expect(await redis.has('a')).toBe(false);
      expect(await redis.keys()).toEqual(['b']);
      expect(await redis.deleteMatching()).toBe(1);
      expect(await redis.deleteMatching()).toBe(0);
    });
  });

  describe('lock', () => {
    test('acquires a lock and releases it once', async () => {
      const lock = await redis.lock('job');

      expect(client.store.has('lock:job')).toBe(true);
      expect(await lock.release()).toBe(true);
      expect(await lock.release()).toBe(false);
    });

    test('fails after the retries of a lock that is held', async () => {
      await redis.lock('job');

      await expect(
        redis.lock('job', { retryCount: 2, retryDelay: 1 })
      ).rejects.toMatchObject({ code: ErrorCode.LockNotAcquired });
      expect(client.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('checkHealth', () => {
    test('reports the ping result, or its error', async () => {
      expect(await redis.checkHealth()).toEqual({ success: true });

      client.ping.mockRejectedValueOnce(new Error('Connection is closed'));

      expect(await redis.checkHealth()).toEqual({
        success: false,
        message: 'Connection is closed'
      });
    });
  });

  describe('lifecycle', () => {
    test('keeps starting while the connection fails', async () => {
      client.connect.mockRejectedValueOnce(new Error('refused'));

      await expect(redis.onInit()).resolves.toBeUndefined();
    });

    test('drops the connection a quit cannot close', async () => {
      client.quit.mockRejectedValueOnce(new Error('closed'));

      await redis.onDestroy();

      expect(client.disconnect).toHaveBeenCalled();
    });

    test('tells whether the client is ready', () => {
      expect(redis.isAvailable()).toBe(true);

      client.status = 'reconnecting';

      expect(redis.isAvailable()).toBe(false);
    });
  });
});
