import { requestContext } from '@fastify/request-context';
import * as bcrypt from 'bcrypt';
import { context } from '../context';
import { AuthUser, ResourceModel } from '../types';
import { isResourceAuthModel } from '../utils';

export function authModel(): ResourceModel | undefined {
  for (const model of Object.values(context.models)) {
    if (isResourceAuthModel(model)) {
      return model;
    }
  }
}

export function currentAuthUser(): AuthUser | null | undefined {
  return requestContext.get('authUser');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt();
  return bcrypt.hash(password, salt);
}

export async function checkPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function updatePasswordHash(
  authUser: Partial<AuthUser>,
  password?: string,
  logout: boolean = false
): Promise<void> {
  if (password) {
    authUser.passwordHash = await hashPassword(password);
    if (logout) {
      authUser.logoutAt = new Date();
    }
    delete authUser['password'];
  }
}

export function hasRole(authUser: AuthUser, role: string): boolean {
  return authUser.roles.findIndex((r) => r.name === role) > -1;
}

export function hasRoles(
  authUser: AuthUser,
  roles: Array<string> | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!roles) {
    return true;
  }

  for (const role of roles) {
    const allowed = hasRole(authUser, role);

    if (allowed && operator === 'or') {
      return true;
    }

    if (!allowed && operator === 'and') {
      return false;
    }
  }

  return operator === 'and' || roles.length === 0;
}

export function hasPermission(authUser: AuthUser, permission: string): boolean {
  const permissions = authUser.roles.flatMap((r) => r.permissions);
  return permissions.findIndex((p) => p.name === permission) > -1;
}

export function hasPermissions(
  authUser: AuthUser,
  permissions: string[] | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!permissions) {
    return true;
  }

  for (const permission of permissions) {
    const allowed = hasPermission(authUser, permission);

    if (allowed && operator === 'or') {
      return true;
    }

    if (!allowed && operator === 'and') {
      return false;
    }
  }

  return operator === 'and' || permissions.length === 0;
}
