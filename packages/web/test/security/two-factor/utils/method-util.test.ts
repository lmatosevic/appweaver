import { configOverrides } from '@appweaver/common';
import {
  effectiveTwoFactorMethods,
  isTwoFactorForced,
  isTwoFactorRequired,
  twoFactorStatus
} from '../../../../security/two-factor/utils/method-util';
import { authUser } from '../../../fixtures/server-fixture';

const overrides = configOverrides;

afterEach(() => {
  for (const key of Object.keys(overrides)) {
    if (key.startsWith('SECURITY_ACCOUNT_2FA_')) {
      delete overrides[key];
    }
  }
});

describe('effectiveTwoFactorMethods', () => {
  beforeEach(() => {
    overrides.SECURITY_ACCOUNT_2FA_ENABLED = true;
  });

  test('should return the methods of the user', () => {
    expect(
      effectiveTwoFactorMethods(authUser({ twoFactorMethods: ['Totp', 'Sms'] }))
    ).toEqual(['Totp', 'Sms']);
  });

  test('should return no methods for a user without any', () => {
    expect(effectiveTwoFactorMethods(authUser())).toEqual([]);
  });

  test('should return the default method when forced, for a user with its verified channel', () => {
    overrides.SECURITY_ACCOUNT_2FA_FORCED = true;
    overrides.SECURITY_ACCOUNT_2FA_DEFAULT_METHOD = 'Sms';

    expect(
      effectiveTwoFactorMethods(
        authUser({ phone: '+385911234567', verifiedPhone: true })
      )
    ).toEqual(['Sms']);
    expect(
      effectiveTwoFactorMethods(
        authUser({ phone: '+385911234567', verifiedPhone: false })
      )
    ).toEqual([]);
    expect(
      effectiveTwoFactorMethods(authUser({ twoFactorMethods: ['Totp'] }))
    ).toEqual(['Totp']);
  });

  test('should never send the codes of the default method to an unverified address', () => {
    overrides.SECURITY_ACCOUNT_2FA_FORCED = true;

    expect(
      effectiveTwoFactorMethods(authUser({ verifiedEmail: true }))
    ).toEqual(['Email']);
    expect(
      effectiveTwoFactorMethods(authUser({ verifiedEmail: false }))
    ).toEqual([]);
  });

  test('should return no methods with 2FA disabled', () => {
    overrides.SECURITY_ACCOUNT_2FA_ENABLED = false;
    overrides.SECURITY_ACCOUNT_2FA_FORCED = true;

    expect(
      effectiveTwoFactorMethods(authUser({ twoFactorMethods: ['Totp'] }))
    ).toEqual([]);
  });
});

describe('twoFactorStatus', () => {
  const now = new Date('2026-12-01T00:00:00.000Z');
  const unverified = (createdAt = '2026-11-28T00:00:00.000Z') =>
    authUser({ verifiedEmail: false, createdAt } as never);

  beforeEach(() => {
    overrides.SECURITY_ACCOUNT_2FA_ENABLED = true;
    overrides.SECURITY_ACCOUNT_2FA_FORCED = true;
  });

  test('requires a forced user without a method or a verified channel to enrol', () => {
    expect(twoFactorStatus(unverified(), now)).toEqual({
      methods: [],
      enroll: true
    });
  });

  test('lets a forced user sign in fully during the grace period, from the account creation', () => {
    overrides.SECURITY_ACCOUNT_2FA_GRACE_PERIOD = '7d';

    expect(twoFactorStatus(unverified(), now)).toEqual({
      methods: [],
      enroll: false,
      enrollBy: new Date('2026-12-05T00:00:00.000Z')
    });
    expect(
      twoFactorStatus(unverified('2026-11-01T00:00:00.000Z'), now).enroll
    ).toBe(true);
  });

  test('counts the grace period from forcedSince for the existing users', () => {
    overrides.SECURITY_ACCOUNT_2FA_GRACE_PERIOD = '7d';
    overrides.SECURITY_ACCOUNT_2FA_FORCED_SINCE = '2026-11-30T00:00:00.000Z';

    expect(
      twoFactorStatus(unverified('2025-01-01T00:00:00.000Z'), now).enrollBy
    ).toEqual(new Date('2026-12-07T00:00:00.000Z'));
  });

  test('never enrols a user 2FA is not forced for', () => {
    overrides.SECURITY_ACCOUNT_2FA_FORCED = false;

    expect(twoFactorStatus(unverified(), now)).toEqual({
      methods: [],
      enroll: false
    });
  });
});

describe('isTwoFactorForced', () => {
  beforeEach(() => {
    overrides.SECURITY_ACCOUNT_2FA_FORCED = true;
  });

  test('forces every user without forcedRoles', () => {
    expect(isTwoFactorForced(authUser())).toBe(true);
  });

  test('forces the users of the forcedRoles only', () => {
    overrides.SECURITY_ACCOUNT_2FA_FORCED_ROLES = ['Admin'];

    expect(
      isTwoFactorForced(authUser({ roles: [{ name: 'Admin' }] } as never))
    ).toBe(true);
    expect(
      isTwoFactorForced(authUser({ roles: [{ name: 'User' }] } as never))
    ).toBe(false);
  });
});

describe('isTwoFactorRequired', () => {
  beforeEach(() => {
    overrides.SECURITY_ACCOUNT_2FA_ENABLED = true;
  });

  test('should require 2FA for a user with a method', () => {
    expect(isTwoFactorRequired(authUser({ twoFactorMethods: ['Email'] }))).toBe(
      true
    );
  });

  test('should require 2FA of a user with a verified email when forced', () => {
    overrides.SECURITY_ACCOUNT_2FA_FORCED = true;

    expect(isTwoFactorRequired(authUser({ verifiedEmail: true }))).toBe(true);
  });

  test('should not require 2FA of a user without a method', () => {
    expect(isTwoFactorRequired(authUser())).toBe(false);
  });
});
