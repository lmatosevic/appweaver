import {
  AuthUser,
  ErrorCode,
  isAppweaverError,
  ResourceId
} from '@appweaver/common';
import { resourceAuthService, withoutPolicies } from '@appweaver/data';

/**
 * Loads a user of the auth model as it is now, from the database rather than a cache, without their password hash.
 *
 * @param {ResourceId} id - The ID of the user.
 * @return {Promise<AuthUser | null | undefined>} The user, `null` when deleted, or `undefined` for an application
 * without an auth model.
 */
export async function loadAuthUser(
  id: ResourceId
): Promise<AuthUser | null | undefined> {
  const service = resourceAuthService();
  if (!service) {
    return undefined;
  }

  try {
    const { passwordHash: _passwordHash, ...user } = await withoutPolicies(() =>
      service.find(id)
    );
    return user;
  } catch (e) {
    if (
      isAppweaverError(e) &&
      (e.code as ErrorCode) === ErrorCode.ResourceNotFound
    ) {
      return null;
    }
    throw e;
  }
}
