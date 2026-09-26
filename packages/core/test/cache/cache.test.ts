import { config, logger, Memory } from '@appweaver/common';
import { Cache } from '../../cache/cache';
import { InMemory } from '../../memory/in-memory';

class TestCache extends Cache {
  constructor(memory: Memory) {
    super(memory);
  }
}

const PREFIX = config.CACHE_KEY_PREFIX;

describe('cache', () => {
  let memory: InMemory;
  let cache: TestCache;

  beforeEach(() => {
    memory = new InMemory();
    cache = new TestCache(memory);
  });

  describe('set / get', () => {
    test('stores and returns a value', async () => {
      await expect(cache.set('posts:1', { id: 1 })).resolves.toBe(true);

      await expect(cache.get('posts:1')).resolves.toEqual({ id: 1 });
    });

    test('prefixes the key in the underlying memory', async () => {
      await cache.set('posts:1', { id: 1 });

      await expect(memory.getValue(`${PREFIX}posts:1`)).resolves.toEqual({
        id: 1
      });
    });

    test('does not prefix an already prefixed key twice', async () => {
      await cache.set(`${PREFIX}posts:1`, { id: 1 });

      await expect(memory.getValue(`${PREFIX}posts:1`)).resolves.toEqual({
        id: 1
      });
      await expect(cache.get('posts:1')).resolves.toEqual({ id: 1 });
    });

    test('returns null for a missing key', async () => {
      await expect(cache.get('missing')).resolves.toBeNull();
    });

    test('expires a value after the given ttl', async () => {
      await cache.set('posts:1', { id: 1 }, 20);

      await expect(cache.get('posts:1')).resolves.toEqual({ id: 1 });
      await new Promise((resolve) => setTimeout(resolve, 40));
      await expect(cache.get('posts:1')).resolves.toBeNull();
    });

    test('keeps a value without expiration for a zero ttl', async () => {
      await cache.set('posts:1', { id: 1 }, 0);

      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(cache.get('posts:1')).resolves.toEqual({ id: 1 });
    });

    test('applies the default ttl when none is given', async () => {
      await cache.set('posts:1', { id: 1 });

      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(cache.get('posts:1')).resolves.toEqual({ id: 1 });
      expect(config.CACHE_DEFAULT_TTL).toBeGreaterThan(20);
    });
  });

  describe('has', () => {
    test('reports whether a key is cached', async () => {
      await cache.set('posts:1', { id: 1 });

      await expect(cache.has('posts:1')).resolves.toBe(true);
      await expect(cache.has('posts:2')).resolves.toBe(false);
    });
  });

  describe('evict', () => {
    test('removes a cached value', async () => {
      await cache.set('posts:1', { id: 1 });

      await expect(cache.evict('posts:1')).resolves.toBe(true);
      await expect(cache.get('posts:1')).resolves.toBeNull();
    });

    test('returns false for a missing key', async () => {
      await expect(cache.evict('missing')).resolves.toBe(false);
    });
  });

  describe('expire', () => {
    test('removes every entry matching the pattern', async () => {
      await cache.set('posts:1', { id: 1 });
      await cache.set('posts:2', { id: 2 });
      await cache.set('users:1', { id: 1 });

      await expect(cache.expire('posts:*')).resolves.toBe(2);

      await expect(cache.get('posts:1')).resolves.toBeNull();
      await expect(cache.get('users:1')).resolves.toEqual({ id: 1 });
    });

    test('removes every entry by default', async () => {
      await cache.set('posts:1', { id: 1 });
      await cache.set('users:1', { id: 1 });

      await expect(cache.expire()).resolves.toBe(2);
      await expect(cache.keys()).resolves.toEqual([]);
    });

    test('returns 0 when nothing matches', async () => {
      await expect(cache.expire('nothing:*')).resolves.toBe(0);
    });
  });

  describe('keys', () => {
    test('returns the prefixed keys of the cached entries', async () => {
      await cache.set('posts:1', { id: 1 });

      await expect(cache.keys()).resolves.toEqual([`${PREFIX}posts:1`]);
    });

    test('filters the keys by pattern', async () => {
      await cache.set('posts:1', { id: 1 });
      await cache.set('users:1', { id: 1 });

      await expect(cache.keys('users:*')).resolves.toEqual([
        `${PREFIX}users:1`
      ]);
    });

    test('returns an empty array for an empty cache', async () => {
      await expect(cache.keys()).resolves.toEqual([]);
    });
  });

  describe('entry eviction', () => {
    const originalEnv = { ...process.env };

    /** Loads a fresh Cache implementation with the given configuration. */
    const createConfiguredCache = async (
      env: Record<string, string>
    ): Promise<Cache> => {
      Object.assign(process.env, env);
      jest.resetModules();

      const cacheModule = await import('../../cache/cache');
      const memoryModule = await import('../../memory/in-memory');

      class ConfiguredCache extends cacheModule.Cache {
        constructor() {
          super(new memoryModule.InMemory());
        }
      }

      return new ConfiguredCache();
    };

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, originalEnv);
      jest.resetModules();
    });

    test('evicts the oldest entries above the configured item limit', async () => {
      const limited = await createConfiguredCache({
        CACHE_MAX_ITEMS: '2',
        CACHE_EVICTION_GRACE_PERIOD: '0',
        CACHE_EVICTION_STRATEGY: 'FIFO'
      });

      await limited.set('a', { id: 1 });
      await limited.set('b', { id: 2 });
      await limited.set('c', { id: 3 });

      const keys = await limited.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain(`${PREFIX}c`);
      expect(keys).not.toContain(`${PREFIX}a`);
    });

    test('keeps entries that are still inside the eviction grace period', async () => {
      const limited = await createConfiguredCache({
        CACHE_MAX_ITEMS: '1',
        CACHE_EVICTION_GRACE_PERIOD: '60000'
      });

      await limited.set('a', { id: 1 });
      await limited.set('b', { id: 2 });

      await expect(limited.keys()).resolves.toHaveLength(2);
    });

    test('evicts the least recently used entry with the LRU strategy', async () => {
      const limited = await createConfiguredCache({
        CACHE_MAX_ITEMS: '2',
        CACHE_EVICTION_GRACE_PERIOD: '0',
        CACHE_EVICTION_STRATEGY: 'LRU'
      });

      await limited.set('a', { id: 1 });
      await limited.set('b', { id: 2 });
      await limited.get('a');

      // Entries only become eviction candidates once they are older than `now`
      await new Promise((resolve) => setTimeout(resolve, 5));
      await limited.set('c', { id: 3 });

      const keys = await limited.keys();
      expect(keys).toContain(`${PREFIX}a`);
      expect(keys).not.toContain(`${PREFIX}b`);
    });
  });

  describe('unavailable memory', () => {
    class FlakyMemory extends InMemory {
      available = true;
      failing = false;

      public isAvailable(): boolean {
        return this.available;
      }

      public async getValue<T = any>(key: string): Promise<T | null> {
        if (this.failing) {
          throw new Error('Connection lost');
        }
        return super.getValue<T>(key);
      }
    }

    let flaky: FlakyMemory;
    let flakyCache: TestCache;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      flaky = new FlakyMemory();
      flakyCache = new TestCache(flaky);
      errorSpy = jest
        .spyOn(logger, 'error')
        .mockImplementation(() => undefined);
      jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('falls back to empty results while the memory is unavailable', async () => {
      await flakyCache.set('posts:1', { id: 1 });
      flaky.available = false;

      await expect(flakyCache.get('posts:1')).resolves.toBeNull();
      await expect(flakyCache.has('posts:1')).resolves.toBe(false);
      await expect(flakyCache.set('posts:2', { id: 2 })).resolves.toBe(false);
      await expect(flakyCache.evict('posts:1')).resolves.toBe(false);
      await expect(flakyCache.expire()).resolves.toBe(0);
      await expect(flakyCache.keys()).resolves.toEqual([]);
    });

    test('falls back to an empty result when the memory action fails', async () => {
      await flakyCache.set('posts:1', { id: 1 });
      flaky.failing = true;

      await expect(flakyCache.get('posts:1')).resolves.toBeNull();
    });

    test('logs the error only once per outage', async () => {
      flaky.available = false;

      await flakyCache.get('posts:1');
      await flakyCache.get('posts:2');

      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    test('clears entries written before the outage once available again', async () => {
      await flakyCache.set('posts:1', { id: 1 });
      flaky.available = false;
      await flakyCache.get('posts:1');
      flaky.available = true;

      await expect(flakyCache.get('posts:1')).resolves.toBeNull();
      await expect(flakyCache.set('posts:1', { id: 2 })).resolves.toBe(true);
      await expect(flakyCache.get('posts:1')).resolves.toEqual({ id: 2 });
    });

    test('defers the clean start until the memory is available', async () => {
      process.env.CACHE_CLEAN_START = 'true';
      jest.resetModules();

      try {
        const common = await import('@appweaver/common');
        const cacheModule = await import('../../cache/cache');
        const memoryModule = await import('../../memory/in-memory');
        const freshErrorSpy = jest
          .spyOn(common.logger, 'error')
          .mockImplementation(() => undefined);

        const memory = new memoryModule.InMemory();
        let available = false;
        jest.spyOn(memory, 'isAvailable').mockImplementation(() => available);

        class CleanStartCache extends cacheModule.Cache {
          constructor() {
            super(memory);
          }
        }
        const clean = new CleanStartCache();

        await memory.putValue(`${PREFIX}posts:1`, { id: 1 });
        await clean.onInit();
        available = true;

        await expect(clean.get('posts:1')).resolves.toBeNull();
        expect(freshErrorSpy).not.toHaveBeenCalled();
      } finally {
        delete process.env.CACHE_CLEAN_START;
        jest.resetModules();
      }
    });

    test('throws the memory error when skipping errors is disabled', async () => {
      process.env.CACHE_SKIP_ON_ERROR = 'false';
      jest.resetModules();

      try {
        const cacheModule = await import('../../cache/cache');
        const memoryModule = await import('../../memory/in-memory');

        const memory = new memoryModule.InMemory();
        jest
          .spyOn(memory, 'getValue')
          .mockRejectedValue(new Error('Connection lost'));

        class StrictCache extends cacheModule.Cache {
          constructor() {
            super(memory);
          }
        }
        const strict = new StrictCache();

        await expect(strict.get('posts:1')).rejects.toThrow('Connection lost');
      } finally {
        delete process.env.CACHE_SKIP_ON_ERROR;
        jest.resetModules();
      }
    });
  });
});
