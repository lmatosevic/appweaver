import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateKeyPair } from 'node:crypto';

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

export async function generateSecurityKeys(
  publicKeyPath: string,
  privateKeyPath: string
): Promise<void> {
  const { privateKey, publicKey } = await promisify(generateKeyPair)('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  await fsp.mkdir(path.dirname(publicKeyPath), { recursive: true });
  await fsp.writeFile(publicKeyPath, publicKey, 'utf8');

  await fsp.mkdir(path.dirname(privateKeyPath), { recursive: true });
  await fsp.writeFile(privateKeyPath, privateKey, 'utf8');
}

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
