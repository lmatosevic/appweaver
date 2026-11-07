import { configOverrides } from '@appweaver/common';
import {
  effectiveTwoFactorMethods,
  isTwoFactorRequired
} from '../../../../security/two-factor/utils/method-util';
import { authUser } from '../../../fixtures/server-fixture';

describe('effectiveTwoFactorMethods', () => {
  beforeEach(() => {
    configOverrides.SECURITY_ACCOUNT_2FA_ENABLED = true;
  });

  afterEach(() => {
    delete configOverrides.SECURITY_ACCOUNT_2FA_ENABLED;
    delete configOverrides.SECURITY_ACCOUNT_2FA_FORCED;
    delete configOverrides.SECURITY_ACCOUNT_2FA_DEFAULT_METHOD;
  });

  test('should return the methods of the user', () => {
    expect(
      effectiveTwoFactorMethods(authUser({ twoFactorMethods: ['Totp', 'Sms'] }))
    ).toEqual(['Totp', 'Sms']);
  });

  test('should return no methods for a user without any', () => {
    expect(effectiveTwoFactorMethods(authUser())).toEqual([]);
  });

  test('should return the default method when forced', () => {
    configOverrides.SECURITY_ACCOUNT_2FA_FORCED = true;
    configOverrides.SECURITY_ACCOUNT_2FA_DEFAULT_METHOD = 'Sms';

    expect(effectiveTwoFactorMethods(authUser())).toEqual(['Sms']);
    expect(
      effectiveTwoFactorMethods(authUser({ twoFactorMethods: ['Totp'] }))
    ).toEqual(['Totp']);
  });

  test('should return no methods with 2FA disabled', () => {
    configOverrides.SECURITY_ACCOUNT_2FA_ENABLED = false;
    configOverrides.SECURITY_ACCOUNT_2FA_FORCED = true;

    expect(
      effectiveTwoFactorMethods(authUser({ twoFactorMethods: ['Totp'] }))
    ).toEqual([]);
  });
});

describe('isTwoFactorRequired', () => {
  beforeEach(() => {
    configOverrides.SECURITY_ACCOUNT_2FA_ENABLED = true;
  });

  afterEach(() => {
    delete configOverrides.SECURITY_ACCOUNT_2FA_ENABLED;
    delete configOverrides.SECURITY_ACCOUNT_2FA_FORCED;
  });

  test('should require 2FA for a user with a method', () => {
    expect(isTwoFactorRequired(authUser({ twoFactorMethods: ['Email'] }))).toBe(
      true
    );
  });

  test('should require 2FA of every user when forced', () => {
    configOverrides.SECURITY_ACCOUNT_2FA_FORCED = true;

    expect(isTwoFactorRequired(authUser())).toBe(true);
  });

  test('should not require 2FA of a user without a method', () => {
    expect(isTwoFactorRequired(authUser())).toBe(false);
  });
});
