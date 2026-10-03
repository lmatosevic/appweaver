import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSign, createVerify } from 'node:crypto';
import {
  ensureSecurityKeys,
  generateSecurityKeys,
  loadSecurityKeys
} from '../../../security/jwt/jwt-keys';

// POSIX file modes are not enforced on Windows
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describe('jwt-keys', () => {
  let tempDir: string;
  let publicKeyPath: string;
  let privateKeyPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-keys-'));
    publicKeyPath = path.join(tempDir, 'keys', 'public.pem');
    privateKeyPath = path.join(tempDir, 'keys', 'private.pem');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateSecurityKeys', () => {
    test('writes a matching RSA key pair in PEM format', async () => {
      await generateSecurityKeys(publicKeyPath, privateKeyPath);

      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');

      const signature = createSign('RSA-SHA256')
        .update('payload')
        .sign(privateKey);
      expect(
        createVerify('RSA-SHA256')
          .update('payload')
          .verify(publicKey, signature)
      ).toBe(true);
    });

    test('creates the key directories of separate paths', async () => {
      const otherPrivateKeyPath = path.join(tempDir, 'private', 'key.pem');

      await generateSecurityKeys(publicKeyPath, otherPrivateKeyPath);

      expect(fs.existsSync(publicKeyPath)).toBe(true);
      expect(fs.existsSync(otherPrivateKeyPath)).toBe(true);
    });

    describePosix('file modes', () => {
      test('restricts the private key to its owner', async () => {
        await generateSecurityKeys(publicKeyPath, privateKeyPath);

        expect(fs.statSync(privateKeyPath).mode & 0o777).toBe(0o600);
        expect(fs.statSync(publicKeyPath).mode & 0o777).toBe(0o644);
        expect(fs.statSync(path.dirname(privateKeyPath)).mode & 0o777).toBe(
          0o700
        );
      });
    });
  });

  describe('ensureSecurityKeys', () => {
    test('keeps the existing keys', async () => {
      await generateSecurityKeys(publicKeyPath, privateKeyPath);
      const before = fs.readFileSync(privateKeyPath, 'utf8');

      await expect(
        ensureSecurityKeys(publicKeyPath, privateKeyPath, true)
      ).resolves.toBe(true);
      expect(fs.readFileSync(privateKeyPath, 'utf8')).toBe(before);
    });

    test('generates the keys when they are missing', async () => {
      await expect(
        ensureSecurityKeys(publicKeyPath, privateKeyPath, true)
      ).resolves.toBe(false);
      expect(fs.existsSync(publicKeyPath)).toBe(true);
      expect(fs.existsSync(privateKeyPath)).toBe(true);
    });

    test('regenerates both keys when only one of them exists', async () => {
      fs.mkdirSync(path.dirname(publicKeyPath), { recursive: true });
      fs.writeFileSync(publicKeyPath, 'stale', 'utf8');

      await expect(
        ensureSecurityKeys(publicKeyPath, privateKeyPath, true)
      ).resolves.toBe(false);
      expect(fs.readFileSync(publicKeyPath, 'utf8')).toContain(
        'BEGIN PUBLIC KEY'
      );
    });

    test('throws when the keys are missing and generating them is off', async () => {
      await expect(
        ensureSecurityKeys(publicKeyPath, privateKeyPath, false)
      ).rejects.toThrow();
      expect(fs.existsSync(publicKeyPath)).toBe(false);
    });
  });

  describe('loadSecurityKeys', () => {
    test('returns the generated keys', async () => {
      const keys = await loadSecurityKeys(publicKeyPath, privateKeyPath, true);

      expect(keys.keysExisted).toBe(false);
      expect(keys.publicKey).toBe(fs.readFileSync(publicKeyPath, 'utf8'));
      expect(keys.privateKey).toBe(fs.readFileSync(privateKeyPath, 'utf8'));
    });

    test('returns the existing keys', async () => {
      await generateSecurityKeys(publicKeyPath, privateKeyPath);

      const keys = await loadSecurityKeys(publicKeyPath, privateKeyPath, false);

      expect(keys.keysExisted).toBe(true);
      expect(keys.privateKey).toContain('BEGIN PRIVATE KEY');
    });
  });
});
