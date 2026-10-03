import { InMemory } from '../../memory/in-memory';

describe('in-memory', () => {
  let memory: InMemory;

  const originalMaxSize = process.env.MEMORY_MAX_SIZE;

  beforeEach(() => {
    memory = new InMemory();
  });

  afterEach(() => {
    if (originalMaxSize === undefined) {
      delete process.env.MEMORY_MAX_SIZE;
    } else {
      process.env.MEMORY_MAX_SIZE = originalMaxSize;
    }
    jest.resetModules();
  });

  describe('set / get', () => {
    test('stores and returns a value', async () => {
      await memory.set('key', 'value');

      await expect(memory.get('key')).resolves.toBe('value');
    });

    test('stores structured values', async () => {
      const value = { id: 1, tags: ['a', 'b'], nested: { flag: true } };

      await memory.set('key', value);

      await expect(memory.get('key')).resolves.toEqual(value);
    });

    test('returns a copy of the stored value', async () => {
      const value = { id: 1 };
      await memory.set('key', value);

      const stored = await memory.get<{ id: number }>('key');
      stored!.id = 2;

      await expect(memory.get('key')).resolves.toEqual({ id: 1 });
    });

    test('supports circular structures', async () => {
      const value: any = { id: 1 };
      value.self = value;

      await memory.set('key', value);
      const stored = await memory.get<any>('key');

      expect(stored.id).toBe(1);
      expect(stored.self).toBe(stored);
    });

    test('returns null for an unknown key', async () => {
      await expect(memory.get('missing')).resolves.toBeNull();
    });

    test('overwrites an existing value', async () => {
      await memory.set('key', 'first');
      await memory.set('key', 'second');

      await expect(memory.get('key')).resolves.toBe('second');
    });

    test('returns null once the expiration has passed', async () => {
      await memory.set('key', 'value', 20);

      await expect(memory.get('key')).resolves.toBe('value');
      await new Promise((resolve) => setTimeout(resolve, 40));
      await expect(memory.get('key')).resolves.toBeNull();
    });

    test('keeps a value without an expiration', async () => {
      await memory.set('key', 'value');

      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(memory.get('key')).resolves.toBe('value');
    });
  });

  describe('has', () => {
    test('returns true for a stored key', async () => {
      await memory.set('key', 'value');

      await expect(memory.has('key')).resolves.toBe(true);
    });

    test('returns false for an unknown key', async () => {
      await expect(memory.has('missing')).resolves.toBe(false);
    });
  });

  describe('delete', () => {
    test('removes a stored value', async () => {
      await memory.set('key', 'value');

      await expect(memory.delete('key')).resolves.toBe(true);
      await expect(memory.get('key')).resolves.toBeNull();
      await expect(memory.has('key')).resolves.toBe(false);
    });

    test('removes an object value', async () => {
      await memory.set('key', { id: 1, tags: ['a'] });

      await expect(memory.delete('key')).resolves.toBe(true);
      await expect(memory.has('key')).resolves.toBe(false);
    });

    test('removes falsy values', async () => {
      await memory.set('zero', 0);
      await memory.set('empty', '');
      await memory.set('false', false);

      await expect(memory.delete('zero')).resolves.toBe(true);
      await expect(memory.delete('empty')).resolves.toBe(true);
      await expect(memory.delete('false')).resolves.toBe(true);
      await expect(memory.keys('*')).resolves.toEqual([]);
    });

    test('returns false for an unknown key', async () => {
      await expect(memory.delete('missing')).resolves.toBe(false);
    });
  });

  describe('keys', () => {
    beforeEach(async () => {
      await memory.set('cache:posts:1', 'a');
      await memory.set('cache:posts:2', 'b');
      await memory.set('cache:users:1', 'c');
      await memory.set('lock:posts', 'd');
    });

    test('returns every key by default', async () => {
      await expect(memory.keys()).resolves.toEqual([
        'cache:posts:1',
        'cache:posts:2',
        'cache:users:1',
        'lock:posts'
      ]);
    });

    test('matches a glob prefix pattern', async () => {
      await expect(memory.keys('cache:posts:*')).resolves.toEqual([
        'cache:posts:1',
        'cache:posts:2'
      ]);
    });

    test('matches a single character wildcard', async () => {
      await expect(memory.keys('cache:users:?')).resolves.toEqual([
        'cache:users:1'
      ]);
    });

    test('escapes regex characters in the pattern', async () => {
      await memory.set('a.b', 'value');

      await expect(memory.keys('a.b')).resolves.toEqual(['a.b']);
      await expect(memory.keys('axb')).resolves.toEqual([]);
    });

    test('returns an empty set when nothing matches', async () => {
      await expect(memory.keys('nothing:*')).resolves.toEqual([]);
    });

    test('drops expired keys', async () => {
      await memory.set('temp:1', 'value', 20);

      await new Promise((resolve) => setTimeout(resolve, 40));

      await expect(memory.keys('temp:*')).resolves.toEqual([]);
      await expect(memory.has('temp:1')).resolves.toBe(false);
    });
  });

  describe('deleteMatching', () => {
    test('removes every entry matching the pattern', async () => {
      await memory.set('cache:posts:1', 'a');
      await memory.set('cache:posts:2', 'b');
      await memory.set('cache:users:1', 'c');

      await expect(memory.deleteMatching('cache:posts:*')).resolves.toBe(2);
      await expect(memory.keys('*')).resolves.toEqual(['cache:users:1']);
    });

    test('returns 0 when nothing matches', async () => {
      await expect(memory.deleteMatching('nothing:*')).resolves.toBe(0);
    });
  });

  describe('sizeBytes', () => {
    test('returns the size of the serialized value', async () => {
      await memory.set('key', 'value');

      const size = await memory.sizeBytes('key');

      expect(size).toBeGreaterThan(0);
    });

    test('grows with the value size', async () => {
      await memory.set('small', 'a');
      await memory.set('large', 'a'.repeat(1000));

      const small = (await memory.sizeBytes('small'))!;
      const large = (await memory.sizeBytes('large'))!;

      expect(large).toBeGreaterThan(small);
    });

    test('returns null for an unknown key', async () => {
      await expect(memory.sizeBytes('missing')).resolves.toBeNull();
    });
  });

  describe('lock', () => {
    test('acquires and releases a lock', async () => {
      const lock = await memory.lock('posts');

      await expect(lock.release()).resolves.toBe(true);
    });

    test('allows acquiring the lock again after release', async () => {
      const first = await memory.lock('posts');
      await first.release();

      const second = await memory.lock('posts', { retryCount: 1 });

      await expect(second.release()).resolves.toBe(true);
    });

    test('does not release an already released lock twice', async () => {
      const lock = await memory.lock('posts');
      await lock.release();

      await expect(lock.release()).resolves.toBe(false);
    });

    test('locks are independent per resource', async () => {
      const posts = await memory.lock('posts');
      const users = await memory.lock('users', { retryCount: 1 });

      await expect(posts.release()).resolves.toBe(true);
      await expect(users.release()).resolves.toBe(true);
    });

    test('throws when the lock cannot be acquired within the retries', async () => {
      await memory.lock('posts', { expireMs: 5000 });

      await expect(
        memory.lock('posts', { retryCount: 2, retryDelay: 10 })
      ).rejects.toThrow('Unable to acquire lock on requested resource');
    });

    test('acquires an expired lock', async () => {
      await memory.lock('posts', { expireMs: 10 });

      await new Promise((resolve) => setTimeout(resolve, 30));

      const lock = await memory.lock('posts', { retryCount: 1 });
      await expect(lock.release()).resolves.toBe(true);
    });
  });

  describe('max size eviction', () => {
    /** Loads a fresh InMemory class with the given maximum storage size. */
    const createLimitedMemory = async (maxSize: string): Promise<InMemory> => {
      process.env.MEMORY_MAX_SIZE = maxSize;
      jest.resetModules();
      const module = await import('../../memory/in-memory');
      return new module.InMemory();
    };

    test('drops the oldest entries once the size limit is exceeded', async () => {
      const limited = await createLimitedMemory('200');

      for (let i = 1; i <= 10; i++) {
        await limited.set(`key-${i}`, 'x'.repeat(50));
      }

      const keys = await limited.keys('*');
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.length).toBeLessThan(10);
      expect(keys).toContain('key-10');
      expect(keys).not.toContain('key-1');
    });

    test('keeps every entry when the limit is not configured', async () => {
      for (let i = 1; i <= 10; i++) {
        await memory.set(`key-${i}`, 'x'.repeat(1000));
      }

      await expect(memory.keys('*')).resolves.toHaveLength(10);
    });
  });

  describe('expired entry cleanup', () => {
    test('purges expired entries when a new value is stored', async () => {
      await memory.set('temp', 'value', 20);
      await new Promise((resolve) => setTimeout(resolve, 40));

      await memory.set('other', 'value');

      await expect(memory.has('temp')).resolves.toBe(false);
      await expect(memory.has('other')).resolves.toBe(true);
    });
  });

  describe('checkHealth', () => {
    test('always reports a successful check', async () => {
      await expect(memory.checkHealth()).resolves.toEqual({ success: true });
    });
  });

  describe('lifecycle', () => {
    test('connects and disconnects without an external client', async () => {
      await expect(memory.onInit()).resolves.toBeUndefined();
      expect(memory.createClient()).toBeUndefined();
      await expect(memory.onDestroy()).resolves.toBeUndefined();
    });

    test('keeps the stored values after init', async () => {
      await memory.set('key', 'value');

      await memory.onInit();

      await expect(memory.get('key')).resolves.toBe('value');
    });
  });
});
