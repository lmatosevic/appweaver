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

  describe('putValue / getValue', () => {
    test('stores and returns a value', async () => {
      await memory.putValue('key', 'value');

      await expect(memory.getValue('key')).resolves.toBe('value');
    });

    test('stores structured values', async () => {
      const value = { id: 1, tags: ['a', 'b'], nested: { flag: true } };

      await memory.putValue('key', value);

      await expect(memory.getValue('key')).resolves.toEqual(value);
    });

    test('returns a copy of the stored value', async () => {
      const value = { id: 1 };
      await memory.putValue('key', value);

      const stored = await memory.getValue<{ id: number }>('key');
      stored!.id = 2;

      await expect(memory.getValue('key')).resolves.toEqual({ id: 1 });
    });

    test('supports circular structures', async () => {
      const value: any = { id: 1 };
      value.self = value;

      await memory.putValue('key', value);
      const stored = await memory.getValue<any>('key');

      expect(stored.id).toBe(1);
      expect(stored.self).toBe(stored);
    });

    test('returns null for an unknown key', async () => {
      await expect(memory.getValue('missing')).resolves.toBeNull();
    });

    test('overwrites an existing value', async () => {
      await memory.putValue('key', 'first');
      await memory.putValue('key', 'second');

      await expect(memory.getValue('key')).resolves.toBe('second');
    });

    test('returns null once the expiration has passed', async () => {
      await memory.putValue('key', 'value', 20);

      await expect(memory.getValue('key')).resolves.toBe('value');
      await new Promise((resolve) => setTimeout(resolve, 40));
      await expect(memory.getValue('key')).resolves.toBeNull();
    });

    test('keeps a value without an expiration', async () => {
      await memory.putValue('key', 'value');

      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(memory.getValue('key')).resolves.toBe('value');
    });
  });

  describe('hasKey', () => {
    test('returns true for a stored key', async () => {
      await memory.putValue('key', 'value');

      await expect(memory.hasKey('key')).resolves.toBe(true);
    });

    test('returns false for an unknown key', async () => {
      await expect(memory.hasKey('missing')).resolves.toBe(false);
    });
  });

  describe('removeValue', () => {
    test('removes a stored value', async () => {
      await memory.putValue('key', 'value');

      await expect(memory.removeValue('key')).resolves.toBe(true);
      await expect(memory.getValue('key')).resolves.toBeNull();
      await expect(memory.hasKey('key')).resolves.toBe(false);
    });

    test('removes an object value', async () => {
      await memory.putValue('key', { id: 1, tags: ['a'] });

      await expect(memory.removeValue('key')).resolves.toBe(true);
      await expect(memory.hasKey('key')).resolves.toBe(false);
    });

    test('removes falsy values', async () => {
      await memory.putValue('zero', 0);
      await memory.putValue('empty', '');
      await memory.putValue('false', false);

      await expect(memory.removeValue('zero')).resolves.toBe(true);
      await expect(memory.removeValue('empty')).resolves.toBe(true);
      await expect(memory.removeValue('false')).resolves.toBe(true);
      await expect(memory.findKeys('*')).resolves.toEqual(new Set());
    });

    test('returns false for an unknown key', async () => {
      await expect(memory.removeValue('missing')).resolves.toBe(false);
    });
  });

  describe('findKeys', () => {
    beforeEach(async () => {
      await memory.putValue('cache:posts:1', 'a');
      await memory.putValue('cache:posts:2', 'b');
      await memory.putValue('cache:users:1', 'c');
      await memory.putValue('lock:posts', 'd');
    });

    test('returns every key by default', async () => {
      await expect(memory.findKeys()).resolves.toEqual(
        new Set([
          'cache:posts:1',
          'cache:posts:2',
          'cache:users:1',
          'lock:posts'
        ])
      );
    });

    test('matches a glob prefix pattern', async () => {
      await expect(memory.findKeys('cache:posts:*')).resolves.toEqual(
        new Set(['cache:posts:1', 'cache:posts:2'])
      );
    });

    test('matches a single character wildcard', async () => {
      await expect(memory.findKeys('cache:users:?')).resolves.toEqual(
        new Set(['cache:users:1'])
      );
    });

    test('escapes regex characters in the pattern', async () => {
      await memory.putValue('a.b', 'value');

      await expect(memory.findKeys('a.b')).resolves.toEqual(new Set(['a.b']));
      await expect(memory.findKeys('axb')).resolves.toEqual(new Set());
    });

    test('returns an empty set when nothing matches', async () => {
      await expect(memory.findKeys('nothing:*')).resolves.toEqual(new Set());
    });

    test('drops expired keys', async () => {
      await memory.putValue('temp:1', 'value', 20);

      await new Promise((resolve) => setTimeout(resolve, 40));

      await expect(memory.findKeys('temp:*')).resolves.toEqual(new Set());
      await expect(memory.hasKey('temp:1')).resolves.toBe(false);
    });
  });

  describe('removeEntries', () => {
    test('removes every entry matching the pattern', async () => {
      await memory.putValue('cache:posts:1', 'a');
      await memory.putValue('cache:posts:2', 'b');
      await memory.putValue('cache:users:1', 'c');

      await expect(memory.removeEntries('cache:posts:*')).resolves.toBe(2);
      await expect(memory.findKeys('*')).resolves.toEqual(
        new Set(['cache:users:1'])
      );
    });

    test('returns 0 when nothing matches', async () => {
      await expect(memory.removeEntries('nothing:*')).resolves.toBe(0);
    });
  });

  describe('valueSizeBytes', () => {
    test('returns the size of the serialized value', async () => {
      await memory.putValue('key', 'value');

      const size = await memory.valueSizeBytes('key');

      expect(size).toBeGreaterThan(0);
    });

    test('grows with the value size', async () => {
      await memory.putValue('small', 'a');
      await memory.putValue('large', 'a'.repeat(1000));

      const small = (await memory.valueSizeBytes('small'))!;
      const large = (await memory.valueSizeBytes('large'))!;

      expect(large).toBeGreaterThan(small);
    });

    test('returns null for an unknown key', async () => {
      await expect(memory.valueSizeBytes('missing')).resolves.toBeNull();
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
        await limited.putValue(`key-${i}`, 'x'.repeat(50));
      }

      const keys = await limited.findKeys('*');
      expect(keys.size).toBeGreaterThan(0);
      expect(keys.size).toBeLessThan(10);
      expect(keys.has('key-10')).toBe(true);
      expect(keys.has('key-1')).toBe(false);
    });

    test('keeps every entry when the limit is not configured', async () => {
      for (let i = 1; i <= 10; i++) {
        await memory.putValue(`key-${i}`, 'x'.repeat(1000));
      }

      await expect(memory.findKeys('*')).resolves.toHaveProperty('size', 10);
    });
  });

  describe('expired entry cleanup', () => {
    test('purges expired entries when a new value is stored', async () => {
      await memory.putValue('temp', 'value', 20);
      await new Promise((resolve) => setTimeout(resolve, 40));

      await memory.putValue('other', 'value');

      await expect(memory.hasKey('temp')).resolves.toBe(false);
      await expect(memory.hasKey('other')).resolves.toBe(true);
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
      await memory.putValue('key', 'value');

      await memory.onInit();

      await expect(memory.getValue('key')).resolves.toBe('value');
    });
  });
});
