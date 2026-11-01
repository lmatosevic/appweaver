import { randomInt } from 'node:crypto';
import {
  AccountError,
  AuthError,
  ErrorCode,
  makeHash,
  ResourceId,
  safeEqual,
  TokenValidationResult
} from '@appweaver/common';
import { twoFactorConfig } from '../../security-config';
import { CodeChallengeData } from '../../../types/http-auth';

/**
 * Generates a random numeric code, i.e. the code of a 2FA challenge sent by email or SMS.
 *
 * @param {number} [length=twoFactorConfig.CODE_LENGTH] - The digits of the code.
 * @return {string} The code, which may start with zeros.
 */
export function generateCode(
  length: number = twoFactorConfig.CODE_LENGTH
): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += randomInt(10);
  }
  return code;
}

/**
 * Checks a code against the hash of a challenge, in a time independent of the code.
 *
 * @param {string | undefined} codeHash - The hash of the sent code.
 * @param {string} code - The code entered by the user.
 * @return {boolean} Whether the code matches.
 */
export function matchesCodeHash(
  codeHash: string | undefined,
  code: string
): boolean {
  return !!codeHash && safeEqual(codeHash, makeHash(code.replace(/\s/g, '')));
}

/**
 * Builds the validation of a one-time token holding a code challenge of a user, counting the wrong codes. A wrong
 * code fails with `ACCOUNT_2FA_CODE_INVALID` and the attempts left, the last allowed one revokes the challenge with
 * `ACCOUNT_2FA_TOO_MANY_ATTEMPTS`, and a challenge of another user fails with `AUTH_INVALID_TOKEN`, keeping it.
 *
 * @param {ResourceId} authUserId - The user entering the code.
 * @param {Function} matches - Checks the entered code against the challenge.
 * @return {Function} The validation of the token content.
 */
export function codeChallengeValidator<T extends CodeChallengeData>(
  authUserId: ResourceId,
  matches: (data: T) => boolean
): (data: T) => TokenValidationResult<T> {
  return (data) => {
    if (String(data.authUserId) !== String(authUserId)) {
      return {
        valid: false,
        message: 'Invalid or expired token provided',
        error: new AuthError(
          ErrorCode.AuthInvalidToken,
          'Invalid or expired token provided'
        )
      };
    }

    if (matches(data)) {
      return { valid: true, message: 'OK' };
    }

    const maxAttempts = twoFactorConfig.MAX_ATTEMPTS;
    const attempts = (data.attempts ?? 0) + 1;
    if (attempts >= maxAttempts) {
      return {
        valid: false,
        message: 'Too many wrong codes',
        revoke: true,
        error: new AccountError(
          ErrorCode.Account2FATooManyAttempts,
          'Too many wrong codes, request a new one',
          { maxAttempts }
        )
      };
    }

    return {
      valid: false,
      message: 'Invalid code provided',
      data: { ...data, attempts },
      error: new AccountError(
        ErrorCode.Account2FACodeInvalid,
        'Invalid code provided',
        { attemptsLeft: maxAttempts - attempts }
      )
    };
  };
}

/**
 * Masks an email address for showing where a code was sent, keeping the first character and the domain.
 *
 * @param {string} email - The email address, i.e. `jane@example.com`.
 * @return {string} The masked address, i.e. `j***@example.com`.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) {
    return '***';
  }
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Masks a phone number for showing where a code was sent, keeping the country prefix and the last two digits.
 *
 * @param {string} phoneNumber - The phone number in the E.164 format, i.e. `+385911234567`.
 * @return {string} The masked number, i.e. `+385*******67`.
 */
export function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length < 7) {
    return '***';
  }
  const visible = phoneNumber.startsWith('+') ? 4 : 3;
  return `${phoneNumber.slice(0, visible)}${'*'.repeat(phoneNumber.length - visible - 2)}${phoneNumber.slice(-2)}`;
}
