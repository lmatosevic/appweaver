import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '@appweaver/common';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The bytes of a generated secret, the 160 bits RFC 4226 recommends for HMAC-SHA1. */
const SECRET_BYTES = 20;

export type TotpOptions = {
  /** The digits of a code. Default: `6`. */
  digits?: number;
  /** The seconds of a time step. Default: `30`. */
  period?: number;
};

export type TotpVerifyOptions = TotpOptions & {
  /** The steps before and after the current one whose codes are accepted, for clock drift. Default: `1`. */
  window?: number;
  /** The time to verify the code at, in milliseconds. Default: now. */
  time?: number;
};

/**
 * Encodes bytes in the unpadded Base32 of RFC 4648, the format of the secrets the authenticator apps read.
 *
 * @param {Buffer} bytes - The bytes to encode.
 * @return {string} The Base32 text, in uppercase without padding.
 */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 text of RFC 4648, ignoring the case, the spaces and the padding.
 *
 * @param {string} text - The Base32 text.
 * @return {Buffer} The decoded bytes.
 * @throws {Error} If the text has a character outside the Base32 alphabet.
 */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error(`Invalid Base32 character '${char}'`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a random TOTP secret.
 *
 * @return {string} The secret in Base32, as the authenticator apps read it.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/**
 * Returns the time step of a time, the counter the TOTP code of RFC 6238 is derived from.
 *
 * @param {number} [time=Date.now()] - The time in milliseconds.
 * @param {number} [period=30] - The seconds of a time step.
 * @return {number} The number of whole steps since the Unix epoch.
 */
export function totpStep(
  time: number = Date.now(),
  period: number = 30
): number {
  return Math.floor(time / 1000 / period);
}

/**
 * Computes the TOTP code of a time step, the HOTP code of RFC 4226 (HMAC-SHA1 with the dynamic truncation) with the
 * step as its counter.
 *
 * @param {string} secret - The secret in Base32.
 * @param {number} step - The time step, see {@link totpStep}.
 * @param {number} [digits=6] - The digits of the code.
 * @return {string} The code, padded with leading zeros.
 */
export function totpCode(
  secret: string,
  step: number,
  digits: number = 6
): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const hmac = createHmac('sha1', base32Decode(secret))
    .update(counter)
    .digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Verifies a TOTP code against the codes of the current time step and the steps of the window around it.
 *
 * @param {string} secret - The secret in Base32.
 * @param {string} code - The code entered by the user.
 * @param {TotpVerifyOptions} [options] - The digits, the period, the window and the time of the verification.
 * @return {number | null} The time step of the matching code, to reject the code once it is used, or `null` when no
 * code of the window matches.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: TotpVerifyOptions = {}
): number | null {
  const { digits = 6, period = 30, window = 1, time = Date.now() } = options;
  const normalized = code.replace(/\s/g, '');
  if (!/^\d+$/.test(normalized) || normalized.length !== digits) {
    return null;
  }

  const current = totpStep(time, period);
  for (let step = current - window; step <= current + window; step++) {
    if (step >= 0 && safeEqual(totpCode(secret, step, digits), normalized)) {
      return step;
    }
  }

  return null;
}

/**
 * Builds the `otpauth://` URI of a secret, which an authenticator app adds from a QR code or a link. It names the
 * SHA1 algorithm, the only one every app supports.
 *
 * @param {Object} params - The secret, the issuer and the account name, i.e. the email of the user, with the digits
 * and the period of the codes.
 * @return {string} The `otpauth://totp/<issuer>:<account>?secret=...` URI.
 */
export function totpUri(
  params: { secret: string; issuer: string; account: string } & TotpOptions
): string {
  const { secret, issuer, account, digits = 6, period = 30 } = params;
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(period)
  });

  return `otpauth://totp/${label}?${query.toString()}`;
}
