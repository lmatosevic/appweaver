import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

const CIPHER = 'aes-256-gcm';

const CIPHER_VERSION = 'v1';

const IV_BYTES = 12;

const TAG_BYTES = 16;

/**
 * Encrypts a text with AES-256-GCM, authenticating it, so a changed ciphertext fails to decrypt. The key is any secret
 * text, hashed into the 32 bytes of the cipher key, and a random IV makes every encryption of the same text differ.
 *
 * @param {string} text - The text to encrypt.
 * @param {string} key - The secret the cipher key is derived from.
 * @return {string} The encrypted text, `v1:<iv>:<tag>:<ciphertext>` with base64url parts.
 */
export function encryptText(text: string, key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, cipherKey(key), iv, {
    authTagLength: TAG_BYTES
  });
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);

  return [
    CIPHER_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
}

/**
 * Decrypts a text encrypted by {@link encryptText} with the same key.
 *
 * @param {string} payload - The encrypted text, `v1:<iv>:<tag>:<ciphertext>`.
 * @param {string} key - The secret the text was encrypted with.
 * @return {string} The decrypted text.
 * @throws {Error} If the payload is malformed, was changed, or was encrypted with another key.
 */
export function decryptText(payload: string, key: string): string {
  const [version, iv, tag, encrypted] = payload.split(':');
  if (version !== CIPHER_VERSION || !iv || !tag || encrypted === undefined) {
    throw new Error('Malformed encrypted text');
  }

  const decipher = createDecipheriv(
    CIPHER,
    cipherKey(key),
    Buffer.from(iv, 'base64url'),
    { authTagLength: TAG_BYTES }
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

/**
 * Compares two texts in a time independent of where they differ, so a comparison of a secret, i.e. a code hash, does
 * not reveal how much of it matched.
 *
 * @param {string} first - The first text.
 * @param {string} second - The second text.
 * @return {boolean} Whether the texts are equal.
 */
export function safeEqual(first: string, second: string): boolean {
  const a = createHash('sha256').update(first).digest();
  const b = createHash('sha256').update(second).digest();

  return timingSafeEqual(a, b);
}

function cipherKey(key: string): Buffer {
  return createHash('sha256').update(key).digest();
}
