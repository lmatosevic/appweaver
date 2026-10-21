import { Readable } from 'node:stream';
import { Storage } from '@appweaver/common';
import { ContractFactory, runner } from './contract-util';

/** Reads a stream into a string. */
async function read(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Tests a `Storage` driver against the behavior every driver shares, with the `describe` and `test` globals of Jest,
 * Vitest or Bun. Each test gets a fresh, initialized instance.
 *
 * @param {string} name - The name of the driver, i.e. `GcsStorage`.
 * @param {ContractFactory<Storage>} create - Creates the driver.
 */
export function testStorageContract(
  name: string,
  create: ContractFactory<Storage>
): void {
  const { describe, test, expect, beforeEach } = runner();

  describe(`${name} implements the Storage contract`, () => {
    let storage: Storage;

    beforeEach(async () => {
      storage = await create();
      await storage.onInit();
    });

    test('stores a file and streams it back', async () => {
      const fileName = await storage.store(
        'contract/hello.txt',
        Readable.from(['hello world']),
        { contentType: 'text/plain', size: 11 }
      );

      expect(fileName).toBeTruthy();
      const content = await storage.stream(fileName!, 0);
      expect(content?.size).toBe(11);
      await expect(read(content!.stream)).resolves.toBe('hello world');
      await storage.delete(fileName!);
    });

    test('streams a byte range of a file', async () => {
      const fileName = await storage.store(
        'contract/range.txt',
        Readable.from(['0123456789'])
      );

      const content = await storage.stream(fileName!, 2, 5);
      await expect(read(content!.stream)).resolves.toBe('2345');
      await storage.delete(fileName!);
    });

    test('tells and deletes the stored files', async () => {
      const fileName = await storage.store(
        'contract/delete.txt',
        Readable.from(['x'])
      );

      await expect(storage.exists(fileName!)).resolves.toBe(true);
      await expect(storage.delete(fileName!)).resolves.toBe(true);
      await expect(storage.exists(fileName!)).resolves.toBe(false);
      await expect(storage.stream(fileName!, 0)).resolves.toBeNull();
    });

    test('returns a URL or null for a direct download', async () => {
      const url = await storage.url('contract/any.txt');

      expect(url === null || typeof url === 'string').toBe(true);
    });

    test('reports its health', async () => {
      await expect(storage.checkHealth()).resolves.toMatchObject({
        success: true
      });
    });
  });
}
