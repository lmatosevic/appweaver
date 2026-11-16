import { AuthUser } from '@appweaver/common';
import { hasPermissions, hasRoles } from '@appweaver/data';
import { RealtimeAccess } from '../types';

/**
 * Checks whether a user may subscribe to a channel or call an action: any user of a public one, and an authenticated
 * user with one of its roles and permissions otherwise.
 *
 * @param {AuthUser | null} user - The user, null when anonymous.
 * @param {RealtimeAccess} access - The access config.
 * @return {boolean} True if the user has access.
 */
export function hasAccess(
  user: AuthUser | null,
  access: RealtimeAccess
): boolean {
  if (access.public) {
    return true;
  }
  return (
    !!user &&
    hasRoles(user, access.roles) &&
    hasPermissions(user, access.permissions)
  );
}
