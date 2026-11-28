import {
  AuthUser,
  parseDuration,
  TwoFactorMethodType
} from '@appweaver/common';
import { hasRole } from '@appweaver/data';
import { twoFactorConfig } from '../../security-config';

/** What a sign-in of a user requires of their 2FA. */
export type TwoFactorStatus = {
  /** The user passes a 2FA challenge, with these methods, the first being the default */
  methods: TwoFactorMethodType[];
  /** The user must enrol a method before anything else */
  enroll: boolean;
  /** The end of the grace period of a forced user without a method, who still signs in fully */
  enrollBy?: Date;
};

/**
 * Tells what a sign-in requires of the 2FA of a user: a challenge with their confirmed methods, or, when 2FA is forced
 * for them and they have none, a challenge with the `defaultMethod` if they have its verified address or number,
 * otherwise an enrolment, unless the grace period still runs.
 *
 * @param {AuthUser} authUser - The user, with their `twoFactorMethods`.
 * @param {Date} [now] - The time the grace period is compared to.
 * @return {TwoFactorStatus} The status.
 */
export function twoFactorStatus(
  authUser: AuthUser,
  now: Date = new Date()
): TwoFactorStatus {
  if (!twoFactorConfig.ENABLED) {
    return { methods: [], enroll: false };
  }

  const methods = (authUser.twoFactorMethods ?? []) as TwoFactorMethodType[];
  if (methods.length > 0 || !isTwoFactorForced(authUser)) {
    return { methods, enroll: false };
  }

  const fallback = twoFactorConfig.DEFAULT_METHOD;
  if (hasVerifiedChannel(authUser, fallback)) {
    return { methods: [fallback], enroll: false };
  }

  const enrollBy = graceEnd(authUser);
  return enrollBy && enrollBy.getTime() > now.getTime()
    ? { methods: [], enroll: false, enrollBy }
    : { methods: [], enroll: true };
}

/**
 * Returns the 2FA methods a user verifies with: their confirmed methods, or the `defaultMethod` of the config when
 * 2FA is forced for them, they have none, and they have its verified address or number.
 *
 * @param {AuthUser} authUser - The user, with their `twoFactorMethods`.
 * @return {TwoFactorMethodType[]} The methods, the first being the default, empty when the user has no 2FA.
 */
export function effectiveTwoFactorMethods(
  authUser: AuthUser
): TwoFactorMethodType[] {
  return twoFactorStatus(authUser).methods;
}

/**
 * Checks if a user has to pass a 2FA challenge after signing in, because 2FA is forced or they enabled a method. A
 * user whose methods are unavailable, i.e. without an SMS sender, is still challenged, so 2FA never turns off on its
 * own.
 *
 * @param {AuthUser} authUser - The user, with their `twoFactorMethods`.
 * @return {boolean} Whether the sign-in issues the tokens of the `2fa` scope.
 */
export function isTwoFactorRequired(authUser: AuthUser): boolean {
  return effectiveTwoFactorMethods(authUser).length > 0;
}

/** Whether 2FA is forced for a user: `forced`, and one of the `forcedRoles` when there are any. */
export function isTwoFactorForced(authUser: AuthUser): boolean {
  const roles = twoFactorConfig.FORCED_ROLES;
  return (
    twoFactorConfig.FORCED &&
    (roles.length === 0 || roles.some((role) => hasRole(authUser, role)))
  );
}

/** Whether a user has the verified address or number the codes of a method are sent to. */
function hasVerifiedChannel(
  authUser: AuthUser,
  method: TwoFactorMethodType
): boolean {
  switch (method) {
    case TwoFactorMethodType.Email:
      return !!authUser.email && !!authUser.verifiedEmail;
    case TwoFactorMethodType.Sms:
      return !!authUser.phone && !!authUser.verifiedPhone;
    default:
      return false;
  }
}

/** The end of the grace period of a user, from the creation of their account or `forcedSince`, the later. */
function graceEnd(authUser: AuthUser): Date | undefined {
  const grace = twoFactorConfig.GRACE_PERIOD
    ? parseDuration(twoFactorConfig.GRACE_PERIOD)
    : undefined;
  if (!grace) {
    return undefined;
  }
  const starts = [
    (authUser as { createdAt?: Date | string }).createdAt,
    twoFactorConfig.FORCED_SINCE
  ]
    .filter((date) => date !== undefined)
    .map((date) => new Date(date).getTime())
    .filter((time) => !Number.isNaN(time));
  if (starts.length === 0) {
    return undefined;
  }
  return new Date(Math.max(...starts) + grace * 1000);
}
