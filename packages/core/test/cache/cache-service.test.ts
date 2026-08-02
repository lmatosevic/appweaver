import { AuthUser, Cache, makeHash } from '@appweaver/common';
import { stringify } from 'flatted';
import { define } from '../../context';
import { CacheService } from '../../cache/cache-service';
import { Cache as CoreCache } from '../../cache/cache';
import { InMemory } from '../../memory/in-memory';
import { createModel } from '../../factory/create-model';
import { resetContext } from '../fixtures/context-fixture';

class TestCache extends CoreCache {
  constructor() {
    super(new InMemory());
  }
}

describe('cache-service', () => {
  let cache: TestCache;
  let service: CacheService;

  beforeEach(() => {
    resetContext();
    cache = new TestCache();
    define(cache, Cache);
    service = new CacheService();
  });

  afterAll(() => {
    resetContext();
  });

  describe('cache', () => {
    test('exposes the injected cache instance', () => {
      expect(service.cache).toBe(cache);
    });
  });

  describe('addToCache / getCachedValue', () => {
    test('adds a value and reads it back', async () => {
      await expect(service.addToCache('posts:1', { id: 1 })).resolves.toBe(
        true
      );

      await expect(service.getCachedValue('posts:1')).resolves.toEqual({
        id: 1
      });
    });

    test('returns null for a value that is not cached', async () => {
      await expect(service.getCachedValue('missing')).resolves.toBeNull();
    });

    test('does not overwrite an existing entry by default', async () => {
      await service.addToCache('posts:1', { id: 1 });

      await expect(service.addToCache('posts:1', { id: 2 })).resolves.toBe(
        false
      );
      await expect(service.getCachedValue('posts:1')).resolves.toEqual({
        id: 1
      });
    });

    test('replaces an existing entry when requested', async () => {
      await service.addToCache('posts:1', { id: 1 });

      await expect(
        service.addToCache('posts:1', { id: 2 }, undefined, true)
      ).resolves.toBe(true);
      await expect(service.getCachedValue('posts:1')).resolves.toEqual({
        id: 2
      });
    });

    test('honours the given ttl', async () => {
      await service.addToCache('posts:1', { id: 1 }, 20);

      await new Promise((resolve) => setTimeout(resolve, 40));

      await expect(service.getCachedValue('posts:1')).resolves.toBeNull();
    });
  });

  describe('removeCachedValue', () => {
    test('removes a cached value', async () => {
      await service.addToCache('posts:1', { id: 1 });

      await expect(service.removeCachedValue('posts:1')).resolves.toBe(true);
      await expect(service.getCachedValue('posts:1')).resolves.toBeNull();
    });

    test('returns false for a value that is not cached', async () => {
      await expect(service.removeCachedValue('missing')).resolves.toBe(false);
    });
  });

  describe('invalidateCache', () => {
    test('expires the entries related to the model', async () => {
      await service.addToCache('posts:query:!Post!:inv', { id: 1 });
      await service.addToCache('users:query:!User!:inv', { id: 1 });

      await service.invalidateCache('Post', 'create');

      await expect(
        service.getCachedValue('posts:query:!Post!:inv')
      ).resolves.toBeNull();
      await expect(
        service.getCachedValue('users:query:!User!:inv')
      ).resolves.toEqual({ id: 1 });
    });

    test('keeps entries that opted out of invalidation', async () => {
      await service.addToCache('posts:static:!Post!', { id: 1 });

      await service.invalidateCache('Post', 'update');

      await expect(
        service.getCachedValue('posts:static:!Post!')
      ).resolves.toEqual({ id: 1 });
    });
  });

  describe('buildCacheKey', () => {
    test('joins the given key parts', () => {
      const key = service.buildCacheKey({
        baseKey: 'route',
        method: 'GET',
        url: '/api/posts'
      });

      expect(key).toBe('route:GET:/api/posts:inv');
    });

    test('omits the invalidation suffix when invalidation is skipped', () => {
      const key = service.buildCacheKey({
        baseKey: 'route',
        method: 'GET',
        url: '/api/posts',
        skipInvalidation: true
      });

      expect(key).toBe('route:GET:/api/posts');
    });

    test('adds the user id for a user specific key', () => {
      const key = service.buildCacheKey({
        baseKey: 'route',
        method: 'GET',
        url: '/api/posts',
        authUser: { id: 42 } as AuthUser
      });

      expect(key).toBe('route:42:GET:/api/posts:inv');
    });

    test('hashes the request body', () => {
      const body = { filter: { enabled: true } };

      const key = service.buildCacheKey({
        baseKey: 'route',
        method: 'POST',
        url: '/api/posts/query',
        body: body as any
      });

      expect(key).toBe(
        `route:POST:/api/posts/query:${makeHash(stringify(body))}:inv`
      );
    });

    test('produces different keys for different bodies', () => {
      const first = service.buildCacheKey({
        baseKey: 'route',
        body: { page: 1 } as any
      });
      const second = service.buildCacheKey({
        baseKey: 'route',
        body: { page: 2 } as any
      });

      expect(first).not.toBe(second);
    });

    test('adds the explicitly listed relations', () => {
      const key = service.buildCacheKey({
        baseKey: 'route',
        url: '/api/posts',
        relations: ['Post', 'User']
      });

      expect(key).toContain('!Post!User!');
    });

    test('ignores a single explicit relation', () => {
      const key = service.buildCacheKey({
        baseKey: 'route',
        url: '/api/posts',
        relations: ['Post']
      });

      expect(key).not.toContain('!Post!');
    });

    test('collects the model relations for a model based key', () => {
      createModel({ name: 'User', scalars: { email: { type: 'string' } } });
      createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } },
        relations: { author: { model: 'User', owner: true } }
      });

      const key = service.buildCacheKey({
        baseKey: 'route',
        url: '/api/posts',
        modelName: 'Post'
      });

      expect(key).toContain('!Post!User!');
    });

    test('skips relations excluded from the output', () => {
      createModel({ name: 'User', scalars: { email: { type: 'string' } } });
      createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } },
        relations: {
          author: { model: 'User', owner: true, output: { type: 'none' } }
        }
      });

      const key = service.buildCacheKey({
        baseKey: 'route',
        url: '/api/posts',
        modelName: 'Post'
      });

      expect(key).toContain('!Post!');
      expect(key).not.toContain('User');
    });

    test('collects the relations of every model for the wildcard', () => {
      createModel({ name: 'User', scalars: { email: { type: 'string' } } });
      createModel({
        name: 'Post',
        scalars: { title: { type: 'string' } },
        relations: { author: { model: 'User', owner: true } }
      });

      const key = service.buildCacheKey({
        baseKey: 'route',
        url: '/api/posts',
        relations: ['*']
      });

      expect(key).toContain('!User!');
    });

    test('deduplicates the collected relations', () => {
      const key = service.buildCacheKey({
        baseKey: 'route',
        url: '/api/posts',
        relations: ['Post', 'Post', 'User']
      });

      expect(key).toContain('!Post!User!');
    });

    test('skips empty key parts', () => {
      expect(service.buildCacheKey({ baseKey: 'route' })).toBe('route:inv');
    });
  });
});
