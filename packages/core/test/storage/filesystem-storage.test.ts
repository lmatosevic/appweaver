import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const tempDir = path.join(
  os.tmpdir(),
  `appweaver-storage-test-${process.pid}-${Date.now()}`
);

let storage: any;

describe('FilesystemStorage', () => {
  beforeAll(async () => {
    fs.mkdirSync(tempDir, { recursive: true });

    process.env.STORAGE_PATH = tempDir;
    jest.resetModules();

    const { FilesystemStorage } =
      await import('../../storage/filesystem-storage');

    storage = new FilesystemStorage();
    await storage.onInit();
  });

  afterAll(() => {
    delete process.env.STORAGE_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('store', () => {
    test('stores a file inside the storage directory', async () => {
      const fileName = await storage.store(
        'posts/1/image.png',
        Readable.from(['content'])
      );

      expect(fileName).toBe('posts/1/image.png');
      expect(
        fs.readFileSync(path.join(tempDir, 'posts/1/image.png'), 'utf8')
      ).toBe('content');
    });

    test('refuses to write outside the storage directory', async () => {
      const fileName = await storage.store(
        '../escaped.png',
        Readable.from(['content'])
      );

      expect(fileName).toBeNull();
      expect(fs.existsSync(path.join(tempDir, '..', 'escaped.png'))).toBe(
        false
      );
    });

    test('refuses to write into a reserved storage path', async () => {
      const fileName = await storage.store(
        'keys/private.key',
        Readable.from(['content'])
      );

      expect(fileName).toBeNull();
      expect(fs.existsSync(path.join(tempDir, 'keys/private.key'))).toBe(false);
    });

    test('refuses an absolute file name', async () => {
      const fileName = await storage.store(
        '/etc/appweaver-test.png',
        Readable.from(['content'])
      );

      expect(fileName).toBeNull();
    });
  });

  describe('stream', () => {
    test('streams a stored file', async () => {
      const result = await storage.stream('posts/1/image.png', 0);
      expect(result?.size).toBe('content'.length);
    });

    test('refuses to read outside the storage directory', async () => {
      expect(await storage.stream('../../etc/passwd', 0)).toBeNull();
    });

    test('refuses to read from a reserved storage path', async () => {
      fs.mkdirSync(path.join(tempDir, 'keys'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'keys/private.key'), 'secret');

      expect(await storage.stream('keys/private.key', 0)).toBeNull();
    });
  });

  describe('exists', () => {
    test('reports paths escaping the storage directory as non existing', async () => {
      expect(await storage.exists('posts/1/image.png')).toBe(true);
      expect(await storage.exists('../escaped.png')).toBe(false);
    });

    test('reports reserved paths as non existing', async () => {
      expect(await storage.exists('keys/private.key')).toBe(false);
    });
  });

  describe('delete', () => {
    test('refuses to delete outside the storage directory', async () => {
      expect(await storage.delete('../escaped.png')).toBe(false);
    });

    test('refuses to delete inside a reserved storage path', async () => {
      fs.mkdirSync(path.join(tempDir, 'keys'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'keys/private.key'), 'secret');

      expect(await storage.delete('keys/private.key')).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'keys/private.key'))).toBe(true);
    });

    test('deletes a regular file', async () => {
      expect(await storage.delete('posts/1/image.png')).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'posts/1/image.png'))).toBe(
        false
      );
    });
  });
});
