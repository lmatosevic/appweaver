import { configOverrides, ErrorCode, makeHash } from '@appweaver/common';
import {
  codeChallengeValidator,
  generateCode,
  maskEmail,
  maskPhoneNumber,
  matchesCodeHash
} from '../../../../security/two-factor/utils/code-util';

describe('generateCode', () => {
  afterEach(() => {
    delete configOverrides.SECURITY_ACCOUNT_2FA_CODE_LENGTH;
  });

  test('should generate a code of the configured digits', () => {
    expect(generateCode()).toMatch(/^\d{6}$/);

    configOverrides.SECURITY_ACCOUNT_2FA_CODE_LENGTH = 8;
    expect(generateCode()).toMatch(/^\d{8}$/);
  });

  test('should generate a code of the given digits', () => {
    expect(generateCode(4)).toMatch(/^\d{4}$/);
  });
});

describe('matchesCodeHash', () => {
  test('should match the code of the hash', () => {
    expect(matchesCodeHash(makeHash('123456'), '123456')).toBe(true);
    expect(matchesCodeHash(makeHash('123456'), '123 456')).toBe(true);
  });

  test('should reject another code or a missing hash', () => {
    expect(matchesCodeHash(makeHash('123456'), '654321')).toBe(false);
    expect(matchesCodeHash(undefined, '123456')).toBe(false);
  });
});

describe('codeChallengeValidator', () => {
  const validate = codeChallengeValidator<any>(1, (data) => data.ok);

  afterEach(() => {
    delete configOverrides.SECURITY_ACCOUNT_2FA_MAX_ATTEMPTS;
  });

  test('should accept a matching code of the user', () => {
    expect(validate({ authUserId: 1, ok: true })).toEqual({
      valid: true,
      message: 'OK'
    });
  });

  test('should compare the user ids as text', () => {
    expect(
      codeChallengeValidator<any>('1', () => true)({ authUserId: 1 }).valid
    ).toBe(true);
  });

  test('should reject the challenge of another user without counting it', () => {
    const result = validate({ authUserId: 2, ok: true, attempts: 0 });

    expect(result).toMatchObject({ valid: false });
    expect(result.data).toBeUndefined();
    expect(result.revoke).toBeUndefined();
    expect(result.error).toMatchObject({ code: ErrorCode.AuthInvalidToken });
  });

  test('should count a wrong code', () => {
    const result = validate({ authUserId: 1, ok: false, attempts: 1 });

    expect(result.data).toEqual({ authUserId: 1, ok: false, attempts: 2 });
    expect(result.error).toMatchObject({
      code: ErrorCode.Account2FACodeInvalid,
      details: { attemptsLeft: 3 }
    });
  });

  test('should count a first wrong code without attempts', () => {
    expect(validate({ authUserId: 1, ok: false }).data.attempts).toBe(1);
  });

  test('should revoke the challenge on the last wrong code', () => {
    configOverrides.SECURITY_ACCOUNT_2FA_MAX_ATTEMPTS = 2;

    const result = validate({ authUserId: 1, ok: false, attempts: 1 });

    expect(result.revoke).toBe(true);
    expect(result.error).toMatchObject({
      code: ErrorCode.Account2FATooManyAttempts,
      details: { maxAttempts: 2 }
    });
  });
});

describe('maskEmail', () => {
  test('should keep the first character and the domain', () => {
    expect(maskEmail('jane@example.com')).toBe('j***@example.com');
  });

  test('should mask a malformed address entirely', () => {
    expect(maskEmail('jane')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
  });
});

describe('maskPhoneNumber', () => {
  test('should keep the country prefix and the last two digits', () => {
    expect(maskPhoneNumber('+385911234567')).toBe('+385*******67');
  });

  test('should keep three digits of a number without a plus', () => {
    expect(maskPhoneNumber('0911234567')).toBe('091*****67');
  });

  test('should mask a short number entirely', () => {
    expect(maskPhoneNumber('+3851')).toBe('***');
  });
});
