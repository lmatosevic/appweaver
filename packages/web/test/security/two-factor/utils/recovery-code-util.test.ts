import { makeHash } from '@appweaver/common';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode
} from '../../../../security/two-factor/utils/recovery-code-util';

describe('generateRecoveryCode', () => {
  test('should generate a code in groups of four characters', () => {
    expect(generateRecoveryCode(16)).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/
    );
  });

  test('should end with a shorter group for a length not divisible by four', () => {
    expect(generateRecoveryCode(10)).toMatch(/^\w{4}-\w{4}-\w{2}$/);
  });

  test('should generate a code of the maximum length', () => {
    expect(normalizeRecoveryCode(generateRecoveryCode(128))).toHaveLength(128);
  });

  test('should never use the characters easy to misread', () => {
    expect(generateRecoveryCode(128)).not.toMatch(/[ILOU]/);
  });

  test('should generate a different code every time', () => {
    expect(generateRecoveryCode(16)).not.toBe(generateRecoveryCode(16));
  });
});

describe('normalizeRecoveryCode', () => {
  test('should remove the separators and uppercase the code', () => {
    expect(normalizeRecoveryCode(' 7g2k-qx9m 4tzb-8hrw ')).toBe(
      '7G2KQX9M4TZB8HRW'
    );
  });
});

describe('hashRecoveryCode', () => {
  test('should hash the normalized code', () => {
    expect(hashRecoveryCode('7g2k-qx9m')).toBe(makeHash('7G2KQX9M'));
    expect(hashRecoveryCode('7G2K QX9M')).toBe(hashRecoveryCode('7G2K-QX9M'));
  });
});
