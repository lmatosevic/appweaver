import { randomInt } from 'node:crypto';
import { makeHash } from '@appweaver/common';

/** The Crockford Base32 alphabet, without the `I`, `L`, `O` and `U` easy to misread. */
const RECOVERY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a random recovery code, in groups of four characters of the Crockford Base32 alphabet.
 *
 * @param {number} length - The characters of the code, without the separators.
 * @return {string} The code, i.e. `7G2K-QX9M-4TZB-8HRW` for 16 characters.
 */
export function generateRecoveryCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return code.match(/.{1,4}/g)!.join('-');
}

/**
 * Normalizes a recovery code entered by a user: in uppercase, without the spaces and the hyphens.
 *
 * @param {string} code - The code entered by the user.
 * @return {string} The normalized code.
 */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Hashes a recovery code, the value stored and looked up instead of the code.
 *
 * @param {string} code - The code, normalized or as entered by the user.
 * @return {string} The SHA-256 of the normalized code, in hex.
 */
export function hashRecoveryCode(code: string): string {
  return makeHash(normalizeRecoveryCode(code));
}
