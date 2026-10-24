import { Memory } from '@appweaver/common';
import { ContractFactory, runner, wait } from './contract-util';

/**
 * Tests a `Memory` driver against the behavior every driver shares, with the `describe` and `test` globals of Jest,
 * Vitest or Bun. Each test gets a fresh, initialized instance, destroyed after it.
 *
 * @param {string} name - The name of the driver, i.e. `RedisMemory`.
 * @param {ContractFactory<Memory>} create - Creates the driver.
 */
export function testMemoryContract(
  name: string,
  create: ContractFactory<Memory>
): void {
  const { describe, test, expect, beforeEach, afterEach } = runner();

  describe(`${name} implements the Memory contract`, () => {
    let memory: Memory;

    beforeEach(async () => {
      memory = await create();
      await memory.onInit();
      await memory.deleteMatching('contract:*');
    });

    afterEach(async () => {
      await memory.deleteMatching('contract:*');
      await memory.onDestroy();
    });

    test('stores and returns structured values', async () => {
      await memory.set('contract:value', { id: 1, tags: ['a'] });

      await expect(memory.get('contract:value')).resolves.toEqual({
        id: 1,
        tags: ['a']
      });
      await expect(memory.get('contract:missing')).resolves.toBeNull();
    });

    test('expires a value after its time to live', async () => {
      await memory.set('contract:ttl', 'value', 50);

      await wait(120);

      await expect(memory.get('contract:ttl')).resolves.toBeNull();
    });

    test('tells and deletes the stored keys', async () => {
      await memory.set('contract:a', 1);

      await expect(memory.has('contract:a')).resolves.toBe(true);
      await expect(memory.delete('contract:a')).resolves.toBe(true);
      await expect(memory.has('contract:a')).resolves.toBe(false);
    });

    test('lists and deletes the keys matching a pattern', async () => {
      await memory.set('contract:list:1', 1);
      await memory.set('contract:list:2', 2);
      await memory.set('contract:other', 3);

      const keys = await memory.keys('contract:list:*');
      expect([...keys].sort()).toEqual(['contract:list:1', 'contract:list:2']);
      await expect(memory.deleteMatching('contract:list:*')).resolves.toBe(2);
      await expect(memory.has('contract:other')).resolves.toBe(true);
    });

    test('locks a resource until the lock is released', async () => {
      const lock = await memory.lock('contract:lock', {
        expireMs: 1000,
        retryCount: 0
      });

      await expect(
        memory.lock('contract:lock', { expireMs: 1000, retryCount: 0 })
      ).rejects.toThrow();
      await expect(lock.release()).resolves.toBe(true);
      const again = await memory.lock('contract:lock', { retryCount: 0 });
      await again.release();
    });

    test('reports its health', async () => {
      await expect(memory.checkHealth()).resolves.toMatchObject({
        success: true
      });
    });
  });
}
