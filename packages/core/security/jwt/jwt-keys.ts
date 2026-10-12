import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateKeyPair } from 'node:crypto';

/** Permissions of the directory holding the security keys (owner only). */
const KEYS_DIR_MODE = 0o700;

/** Permissions of the generated private key file (owner read/write only). */
const PRIVATE_KEY_MODE = 0o600;

/** Permissions of the generated public key file (owner read/write, others read). */
const PUBLIC_KEY_MODE = 0o644;

/**
 * Checks that both security key files exist, generating them otherwise when allowed.
 *
 * @param {string} publicKeyPath - The path of the public key file.
 * @param {string} privateKeyPath - The path of the private key file.
 * @param {boolean} generateIfNotExists - Whether to generate the keys when a file is missing.
 * @return {Promise<boolean>} `true` if both keys existed, `false` if they were generated.
 */
export async function ensureSecurityKeys(
  publicKeyPath: string,
  privateKeyPath: string,
  generateIfNotExists: boolean
): Promise<boolean> {
  try {
    await fsp.access(publicKeyPath, fsp.constants.F_OK);
    await fsp.access(privateKeyPath, fsp.constants.F_OK);
    return true;
  } catch (e) {
    if (!generateIfNotExists) {
      throw e;
    }
    await generateSecurityKeys(publicKeyPath, privateKeyPath);
    return false;
  }
}

/**
 * Generates an RSA key pair and writes it to the given PEM files, readable only by the owner for the private key.
 *
 * @param {string} publicKeyPath - The path of the public key file.
 * @param {string} privateKeyPath - The path of the private key file.
 */
export async function generateSecurityKeys(
  publicKeyPath: string,
  privateKeyPath: string
): Promise<void> {
  const { privateKey, publicKey } = await promisify(generateKeyPair)('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  await fsp.mkdir(path.dirname(publicKeyPath), {
    recursive: true,
    mode: KEYS_DIR_MODE
  });
  await fsp.writeFile(publicKeyPath, publicKey, {
    encoding: 'utf8',
    mode: PUBLIC_KEY_MODE
  });

  await fsp.mkdir(path.dirname(privateKeyPath), {
    recursive: true,
    mode: KEYS_DIR_MODE
  });
  await fsp.writeFile(privateKeyPath, privateKey, {
    encoding: 'utf8',
    mode: PRIVATE_KEY_MODE
  });
}

/**
 * Reads the security keys, generating them first when missing and allowed.
 *
 * @param {string} publicKeyPath - The path of the public key file.
 * @param {string} privateKeyPath - The path of the private key file.
 * @param {boolean} generateIfNotExists - Whether to generate the keys when a file is missing.
 * @return {Promise<Object>} The PEM encoded keys, and whether they existed before.
 */
export async function loadSecurityKeys(
  publicKeyPath: string,
  privateKeyPath: string,
  generateIfNotExists: boolean
): Promise<{
  keysExisted: boolean;
  publicKey: string;
  privateKey: string;
}> {
  const keysExisted = await ensureSecurityKeys(
    publicKeyPath,
    privateKeyPath,
    generateIfNotExists
  );

  const publicKey = await fsp.readFile(publicKeyPath, 'utf8');
  const privateKey = await fsp.readFile(privateKeyPath, 'utf8');

  return { keysExisted, publicKey, privateKey };
}
