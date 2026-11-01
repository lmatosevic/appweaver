import { AuthUser, TwoFactorMethodType } from '@appweaver/common';
import { twoFactorConfig } from '../../security-config';

/**
 * Returns the 2FA methods a user verifies with: their confirmed methods, or the `defaultMethod` of the config when
 * 2FA is forced and they have none.
 *
 * @param {AuthUser} authUser - The user, with their `twoFactorMethods`.
 * @return {TwoFactorMethodType[]} The methods, the first being the default, empty when the user has no 2FA.
 */
export function effectiveTwoFactorMethods(
  authUser: AuthUser
): TwoFactorMethodType[] {
  if (!twoFactorConfig.ENABLED) {
    return [];
  }

  const methods = (authUser.twoFactorMethods ?? []) as TwoFactorMethodType[];
  if (methods.length > 0) {
    return methods;
  }

  return twoFactorConfig.FORCED ? [twoFactorConfig.DEFAULT_METHOD] : [];
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
